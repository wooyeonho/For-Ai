#!/usr/bin/env node
import { argv, exit, stdout } from 'node:process';
import { openDb, DEFAULT_DB_PATH } from './core/db.mjs';
import { migrate, MIGRATIONS_DIR, appliedMigrations } from './core/migrate.mjs';
import { appendEvent, readEvents, verifyChain } from './core/events.mjs';
import { catchUp, rebuild } from './core/projections.mjs';
import { createBackup, verifyBackup, restoreBackup } from './core/backup.mjs';
import { setStop, stopEngaged } from './core/governor.mjs';
import { statusReport, verifyReport } from './domain/status.mjs';
import {
  startRun,
  checkpointRun,
  openBlocker,
  settleBlocker,
  queueNextRun,
  takeNextRun,
  handoffReport,
  pendingNextRuns,
} from './domain/handoff.mjs';
import { activateDesires, goalTrace, observe, remember, selfReport } from './domain/self.mjs';
import { soakReport } from './domain/soak.mjs';
import { gateReport, passGate } from './domain/gate.mjs';

const USAGE = `yeno <command>

  migrate                          apply pending migrations (drift-checked)
  status [--json]                  kernel status
  verify [--json]                  machine verification of kernel invariants
  event append --type T [--payload JSON] [--actor A] [--authority A1]
  event list [--from SEQ]
  event replay [--json]            recompute chain + projections from seq 0
  projection rebuild               drop and rebuild all projections
  backup create                    consistent copy + manifest
  backup verify <path>             hash/integrity/chain/manifest check
  restore --from <backup> --to <newDb> [--force]
  stop engage --reason R           engage emergency stop
  stop release --reason R          release emergency stop (Owner authority)
  handoff show [--json]            state, blockers, NEXT_RUN for the next session
  run start --ref R --gate G --goal G --baseline B [--authority A2] [--session S]
  run checkpoint --ref R --report TEXT [--evidence REF] [--state CHECKPOINTED]
  blocker add --kind K --from OWNER --title T --detail D [--gate G] [--workaround W]
  blocker settle <id> --resolution R [--state RESOLVED|ABANDONED]
  next add --gate G --action A --rationale R [--priority N] [--blocked-by ID]
  next list [--json]               pending queue in take order
  next take --ref R                consume the top entry for a session run
  self report [--json]             functional self state (G6 PREP_ONLY)
  self remember --kind K --content C --source S --confidence N [--salience N]
  self observe --metric M --value N
  self activate                    derive desire activations from internal state
  self trace <goalId> [--json]     desire -> activation -> goal -> council -> verdict
  soak report [--soak ID] [--json] G1 durability soak sessions and probe results
  gate list [--json]               release train state and evidence presence
  gate pass --gate G --evidence E  promote a gate only if its machine checks hold
                                   (refusal reasons are recorded, never bypassed)

Options: --db <path> (default ${DEFAULT_DB_PATH}), --migrations <dir> (default ${MIGRATIONS_DIR})`;

function parseArgs(args) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next === undefined || next.startsWith('--')) flags[key] = true;
      else {
        flags[key] = next;
        i += 1;
      }
    } else positional.push(arg);
  }
  return { positional, flags };
}

function str(value, message) {
  if (typeof value !== 'string' || value === '') throw new Error(message);
  return value;
}

function print(value, json) {
  stdout.write(json ? `${JSON.stringify(value, null, 2)}\n` : `${format(value)}\n`);
}

function format(value, indent = 0) {
  const pad = ' '.repeat(indent);
  if (Array.isArray(value)) return value.map((v) => `${pad}- ${format(v, indent + 2).trimStart()}`).join('\n');
  if (value && typeof value === 'object') {
    return Object.entries(value)
      .map(([k, v]) =>
        v && typeof v === 'object' ? `${pad}${k}:\n${format(v, indent + 2)}` : `${pad}${k}: ${v}`,
      )
      .join('\n');
  }
  return `${pad}${value}`;
}

async function main() {
  const { positional, flags } = parseArgs(argv.slice(2));
  const [command, sub] = positional;
  const dbPath = typeof flags.db === 'string' ? flags.db : DEFAULT_DB_PATH;
  const migrationsDir = typeof flags.migrations === 'string' ? flags.migrations : MIGRATIONS_DIR;
  const json = flags.json === true;

  if (!command || command === 'help' || flags.help) {
    stdout.write(`${USAGE}\n`);
    return 0;
  }

  if (command === 'migrate') {
    const db = openDb(dbPath);
    try {
      const applied = migrate(db, migrationsDir);
      print({ applied, total: appliedMigrations(db).length }, json);
    } finally {
      db.close();
    }
    return 0;
  }

  const db = openDb(dbPath);
  try {
    switch (`${command} ${sub ?? ''}`.trim()) {
      case 'status': {
        print(statusReport(db, { migrationsDir }), json);
        return 0;
      }
      case 'verify': {
        const report = verifyReport(db, { migrationsDir });
        print(report, json);
        return report.ok ? 0 : 1;
      }
      case 'event append': {
        const payload = typeof flags.payload === 'string' ? JSON.parse(flags.payload) : {};
        const ev = appendEvent(db, {
          eventId: typeof flags['event-id'] === 'string' ? flags['event-id'] : undefined,
          type: String(flags.type ?? ''),
          actor: typeof flags.actor === 'string' ? flags.actor : 'cli',
          authority: typeof flags.authority === 'string' ? flags.authority : 'A1',
          payload,
        });
        catchUp(db);
        print({ seq: ev.seq, event_id: ev.event_id, hash: ev.hash, idempotent: ev.idempotent }, json);
        return 0;
      }
      case 'event list': {
        const from = Number(flags.from ?? 0);
        print(readEvents(db, from).map((e) => ({ seq: e.seq, ts: e.ts, type: e.type, hash: e.hash })), json);
        return 0;
      }
      case 'event replay': {
        const chain = verifyChain(db);
        const projections = rebuild(db);
        print({ chain, projections }, json);
        return chain.ok ? 0 : 1;
      }
      case 'projection rebuild': {
        print(rebuild(db), json);
        return 0;
      }
      case 'backup create': {
        const result = await createBackup(db);
        print({ backup_id: result.backupId, path: result.path, db_sha256: result.dbHash }, json);
        return 0;
      }
      case 'backup verify': {
        const path = positional[2] ?? flags.path;
        if (typeof path !== 'string') throw new Error('backup verify requires a path');
        const result = await verifyBackup(path, { liveDb: db });
        print(result, json);
        return result.ok ? 0 : 1;
      }
      case 'restore': {
        const from = flags.from;
        const to = flags.to;
        if (typeof from !== 'string' || typeof to !== 'string') {
          throw new Error('restore requires --from <backup> --to <newDb>');
        }
        const result = await restoreBackup(from, to, { force: flags.force === true });
        print(result, json);
        return result.ok ? 0 : 1;
      }
      case 'handoff show': {
        print(handoffReport(db), json);
        return 0;
      }
      case 'run start': {
        const run = startRun(db, {
          runRef: str(flags.ref, 'run start requires --ref'),
          gateId: str(flags.gate, 'run start requires --gate'),
          goal: str(flags.goal, 'run start requires --goal'),
          baselineRef: str(flags.baseline, 'run start requires --baseline'),
          sessionRef: typeof flags.session === 'string' ? flags.session : null,
          authority: typeof flags.authority === 'string' ? flags.authority : 'A2',
        });
        print({ run_ref: run.run_ref, state: run.state, idempotent: run.idempotent }, json);
        return 0;
      }
      case 'run checkpoint': {
        const run = checkpointRun(db, str(flags.ref, 'run checkpoint requires --ref'), {
          report: str(flags.report, 'run checkpoint requires --report'),
          evidenceRef: typeof flags.evidence === 'string' ? flags.evidence : null,
          state: typeof flags.state === 'string' ? flags.state : 'CHECKPOINTED',
        });
        print({ run_ref: run.run_ref, state: run.state, ended_at: run.ended_at }, json);
        return 0;
      }
      case 'blocker add': {
        const blocker = openBlocker(db, {
          kind: str(flags.kind, 'blocker add requires --kind'),
          neededFrom: str(flags.from, 'blocker add requires --from'),
          title: str(flags.title, 'blocker add requires --title'),
          detail: str(flags.detail, 'blocker add requires --detail'),
          gateId: typeof flags.gate === 'string' ? flags.gate : null,
          workaround: typeof flags.workaround === 'string' ? flags.workaround : null,
        });
        print({ blocker_id: blocker.blocker_id, state: blocker.state }, json);
        return 0;
      }
      case 'blocker settle': {
        const id = positional[2] ?? flags.id;
        if (typeof id !== 'string') throw new Error('blocker settle requires an id');
        const blocker = settleBlocker(db, id, {
          state: typeof flags.state === 'string' ? flags.state : 'RESOLVED',
          resolution: str(flags.resolution, 'blocker settle requires --resolution'),
        });
        print({ blocker_id: blocker.blocker_id, state: blocker.state }, json);
        return 0;
      }
      case 'next add': {
        const entry = queueNextRun(db, {
          gateId: str(flags.gate, 'next add requires --gate'),
          exactAction: str(flags.action, 'next add requires --action'),
          rationale: str(flags.rationale, 'next add requires --rationale'),
          priority: Number(flags.priority ?? 0),
          blockedBy: typeof flags['blocked-by'] === 'string' ? flags['blocked-by'] : null,
          createdBy: typeof flags.actor === 'string' ? flags.actor : 'cli',
        });
        print({ next_id: entry.next_id, gate_id: entry.gate_id, priority: entry.priority }, json);
        return 0;
      }
      case 'next list': {
        print(
          pendingNextRuns(db).map((n) => ({
            next_id: n.next_id,
            gate_id: n.gate_id,
            priority: n.priority,
            exact_action: n.exact_action,
          })),
          json,
        );
        return 0;
      }
      case 'next take': {
        const entry = takeNextRun(db, str(flags.ref, 'next take requires --ref'));
        if (!entry) {
          print({ taken: null, reason: 'no unblocked NEXT_RUN entry' }, json);
          return 1;
        }
        print({ next_id: entry.next_id, gate_id: entry.gate_id, exact_action: entry.exact_action }, json);
        return 0;
      }
      case 'gate list': {
        print(gateReport(db), json);
        return 0;
      }
      case 'gate pass': {
        const outcome = passGate(db, str(flags.gate, 'gate pass requires --gate'), {
          evidenceRef: str(flags.evidence, 'gate pass requires --evidence'),
          migrationsDir,
        });
        print(outcome, json);
        return outcome.promoted ? 0 : 1;
      }
      case 'soak report': {
        print(soakReport(db, typeof flags.soak === 'string' ? flags.soak : null), json);
        return 0;
      }
      case 'self report': {
        print(selfReport(db), json);
        return 0;
      }
      case 'self remember': {
        const item = remember(db, {
          kind: str(flags.kind, 'self remember requires --kind'),
          content: str(flags.content, 'self remember requires --content'),
          sourceRef: str(flags.source, 'self remember requires --source'),
          confidence: Number(flags.confidence ?? 0.5),
          salience: Number(flags.salience ?? 0),
        });
        print({ memory_id: item.memory_id, kind: item.kind, idempotent: item.idempotent }, json);
        return 0;
      }
      case 'self observe': {
        const row = observe(db, str(flags.metric, 'self observe requires --metric'), Number(flags.value));
        print(row, json);
        return 0;
      }
      case 'self activate': {
        print(activateDesires(db), json);
        return 0;
      }
      case 'self trace': {
        const goalId = positional[2] ?? flags.goal;
        if (typeof goalId !== 'string') throw new Error('self trace requires a goal id');
        print(goalTrace(db, goalId), json);
        return 0;
      }
      case 'stop engage': {
        setStop(db, true, String(flags.reason ?? 'cli'), 'cli');
        print({ emergency_stop: stopEngaged(db) ? 'ON' : 'OFF' }, json);
        return 0;
      }
      case 'stop release': {
        setStop(db, false, String(flags.reason ?? 'cli'), 'owner');
        print({ emergency_stop: stopEngaged(db) ? 'ON' : 'OFF' }, json);
        return 0;
      }
      default:
        stdout.write(`${USAGE}\n`);
        return 2;
    }
  } finally {
    db.close();
  }
}

try {
  exit(await main());
} catch (err) {
  process.stderr.write(`ERROR: ${err.message}\n`);
  exit(1);
}
