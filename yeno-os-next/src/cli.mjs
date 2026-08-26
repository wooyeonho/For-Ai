#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { argv, exit, stdout } from 'node:process';
import { openDb, DEFAULT_DB_PATH } from './core/db.mjs';
import { migrate, MIGRATIONS_DIR, appliedMigrations } from './core/migrate.mjs';
import { appendEvent, readEvents, verifyChain } from './core/events.mjs';
import { catchUp, rebuild } from './core/projections.mjs';
import { createBackup, verifyBackup, restoreBackup } from './core/backup.mjs';
import { setStop, stopEngaged } from './core/governor.mjs';
import { sha256, sha256Json } from './core/hash.mjs';
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
import {
  admissionCheck,
  admissionReport,
  approvalList,
  g3Acceptance,
  grantApproval,
  redteamProbes,
  revokeApproval,
} from './domain/governance.mjs';
import {
  ingest,
  intakeReport,
  promoteInbox,
  recordCandidateProbe,
  recordRecoveryAttempt,
  recoveryQueue,
  registerParsers,
} from './domain/intake.mjs';
import {
  cancelJob,
  claimNextJob,
  commitEffect,
  abandonEffect,
  completeJob,
  enqueueJob,
  failJob,
  g4Acceptance,
  queueReport,
  reclaimStuckJobs,
  setScheduler,
} from './domain/workflow.mjs';
import {
  g7Acceptance,
  portfolioReport,
  recordDemandEvidence,
  registerAdapter,
  runPortfolioCycle,
  setProjectStatus,
} from './domain/portfolio.mjs';
import { makeArtifactVerifier } from './domain/portfolio-verifier.mjs';
import { panel, panels, panelNames, g8ReadSideAcceptance } from './domain/mission-control.mjs';
import {
  createServer as createApiServer,
  COMMANDS as API_COMMANDS,
  DEFAULT_ORIGINS as API_ORIGINS,
  LOOPBACK as API_LOOPBACK,
} from './api/server.mjs';
import {
  createSchedule,
  setScheduleEnabled,
  tickScheduler,
  scheduleReport,
  schedulerAcceptance,
} from './domain/scheduler.mjs';

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
  intake parsers                   register the built-in parser registry
  intake file --path P --parser ID [--kind FILE] [--origin REF] [--note N]
                                   seal bytes in the vault, then parse (re-import is a no-op)
  intake report [--json]           coverage invariant, parsers, states, candidates
  intake queue [--json] [--limit N] items still waiting on a body
  recovery attempt --inbox ID --method M --outcome O [--source-version SV] [--evidence E] --detail D
  candidate probe --id ID --state S [--evidence E] [--detail D]
  inbox promote --inbox ID --code C --name N [--body-evidence E] [--owner-confirmation E]
                                   refuses title-only promotion
  approval grant --action A --target T --expires ISO --rollback R --packet REF
                 [--payload JSON] [--max-cost N] [--max-uses N]
                                   one-shot scoped grant (same scope = same grant);
                                   --packet is the Owner Packet file that authorised it
  approval list [--json]           grants with LIVE/EXPIRED/EXHAUSTED/REVOKED state
  approval revoke <id> --reason R   revocation is final
  admit check --goal G --authority A [--method-class SAFE] [--approval ID]
              [--action A --target T --payload JSON] [--cost N] [--budget BP-LOCAL]
                                   run the real admission order, record the attempt
  admit report [--json] [--limit N] stop state, grants, denial reason codes, leases
  redteam report [--json] [--class C] recorded bypass attempts and G3 acceptance
  queue add --kind K [--payload JSON] [--queue Q] [--authority A2] [--max-attempts N]
                                   durable enqueue; the same payload twice is one job
  queue claim --worker W [--queue Q] [--lease-ms N]
                                   lease the next runnable job with a fencing token
  queue done --job ID --worker W --token N [--artifact REF]
  queue fail --job ID --worker W --token N --error E
                                   retry with backoff, then dead-letter
  queue reclaim [--queue Q]        recover jobs whose worker died (attempt is not refunded)
  queue cancel --job ID --reason R
  queue effect --effect ID --evidence REF [--abandon]
                                   settle an effect claim: committed by default, or
                                   abandoned to record that it never reached the world
  queue scheduler --enable|--disable --reason R
                                   OFF at install; only the Owner turns it on
  schedule add --name N --kind K --interval-ms N --reason R [--payload JSON]
              [--queue Q] [--authority A2] [--catchup] [--arm]
                                   created disarmed unless --arm; intent is immutable
  schedule arm|disarm --name N --reason R
  schedule tick [--json]           fire every owed occurrence at most once
  schedule report [--json]         schedules, boundaries fired, acceptance
  queue report [--json] [--queue Q] queue depth, dead letters, effects, G4 acceptance
  portfolio adapter --project ID --kind for_ai|shopping_shorts [--enable] [--note N]
                                   register a project adapter (disabled by default)
  portfolio demand --project ID --kind DEMAND|UTILITY --metric M --value N
                   --source REF [--detail D]
                                   measured demand or utility; a number with no
                                   source is refused, and rows are append-only
  portfolio activate --project ID --status BUILD|WATCH|REGISTRY|ARCHIVE --reason R
                                   refused without demand+utility, or past capacity
  portfolio run --project ID --kind K --source-version ID [--worker W]
                [--artifact-dir DIR]
                                   one pass: source -> goal -> RUN -> independent
                                   verification -> outcome -> memory
  portfolio report [--json]        capacity, adapters, demand, cycles, G7 acceptance
  mc panels [--json] [--limit N]   the whole Mission Control read surface, served
                                   from a read-only handle (8 panels + G8 read-side
                                   acceptance)
  mc panel --name inbox|projects|timeline|council|approvals|evidence|costs|settings
           [--json] [--limit N]    one panel, deterministic, no writes possible
  api serve [--port N] [--json]     local facade for the desktop shell: 127.0.0.1
                                   only, token required, reads read-only, writes
                                   limited to the allowlisted command vocabulary
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

  // Mission Control is the read side only: it is served from a read-only handle
  // so a panel can never write, no matter what the code above it asks for.
  if (command === 'mc') {
    const roDb = openDb(dbPath, { readOnly: true });
    try {
      const limit = flags.limit === undefined ? null : Number(flags.limit);
      if (sub === 'panels' || sub === undefined) {
        const acceptance = g8ReadSideAcceptance(roDb);
        print({ ...panels(roDb, { limit }), acceptance }, json);
        return acceptance.ok ? 0 : 1;
      }
      if (sub === 'panel') {
        const name = str(flags.name, `mc panel needs --name (${panelNames().join('|')})`);
        print(panel(roDb, name, { limit }), json);
        return 0;
      }
      stdout.write(`${USAGE}\n`);
      return 2;
    } finally {
      roDb.close();
    }
  }

  // The API is the only door a desktop shell gets, so the CLI never lets it open
  // wider than loopback and never lets it run without a token.
  if (command === 'api' && sub === 'serve') {
    const token = typeof flags.token === 'string' ? flags.token : randomBytes(24).toString('hex');
    const api = createApiServer({ dbPath, token });
    const address = await api.listen(flags.port === undefined ? 0 : Number(flags.port));
    print(
      {
        bound: `${API_LOOPBACK}:${address.port}`,
        loopback_only: address.address === API_LOOPBACK,
        token_supplied: typeof flags.token === 'string',
        token,
        commands: Object.keys(API_COMMANDS),
        origins: API_ORIGINS,
      },
      json,
    );
    if (flags.once) {
      await api.close();
      return 0;
    }
    await new Promise((resolve) => {
      process.once('SIGINT', resolve);
      process.once('SIGTERM', resolve);
    });
    await api.close();
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
      case 'intake parsers': {
        print(registerParsers(db), json);
        return 0;
      }
      case 'intake file': {
        const path = str(flags.path, 'intake file requires --path');
        const result = ingest(db, {
          bytes: readFileSync(path),
          kind: typeof flags.kind === 'string' ? flags.kind : 'FILE',
          originRef: typeof flags.origin === 'string' ? flags.origin : path,
          parserId: str(flags.parser, 'intake file requires --parser'),
          note: typeof flags.note === 'string' ? flags.note : null,
        });
        catchUp(db);
        print(result, json);
        return result.outcome === 'REJECTED' ? 1 : 0;
      }
      case 'intake report': {
        const report = intakeReport(db);
        print(report, json);
        return report.ok ? 0 : 1;
      }
      case 'intake queue': {
        print(recoveryQueue(db, Number(flags.limit ?? 20)), json);
        return 0;
      }
      case 'recovery attempt': {
        const result = recordRecoveryAttempt(db, str(flags.inbox, 'recovery attempt requires --inbox'), {
          method: str(flags.method, 'recovery attempt requires --method'),
          outcome: str(flags.outcome, 'recovery attempt requires --outcome'),
          sourceVersionId: typeof flags['source-version'] === 'string' ? flags['source-version'] : null,
          evidenceRef: typeof flags.evidence === 'string' ? flags.evidence : null,
          detail: str(flags.detail, 'recovery attempt requires --detail'),
        });
        catchUp(db);
        print(result, json);
        return 0;
      }
      case 'candidate probe': {
        const row = recordCandidateProbe(db, str(flags.id, 'candidate probe requires --id'), {
          state: str(flags.state, 'candidate probe requires --state'),
          evidenceRef: typeof flags.evidence === 'string' ? flags.evidence : null,
          detail: typeof flags.detail === 'string' ? flags.detail : '',
        });
        print(row, json);
        return 0;
      }
      case 'inbox promote': {
        const result = promoteInbox(db, str(flags.inbox, 'inbox promote requires --inbox'), {
          code: str(flags.code, 'inbox promote requires --code'),
          name: str(flags.name, 'inbox promote requires --name'),
          bodyEvidenceRef: typeof flags['body-evidence'] === 'string' ? flags['body-evidence'] : null,
          ownerConfirmationRef:
            typeof flags['owner-confirmation'] === 'string' ? flags['owner-confirmation'] : null,
          programUg: typeof flags.program === 'string' ? flags.program : null,
        });
        catchUp(db);
        print(result, json);
        return result.promoted ? 0 : 1;
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
      case 'approval grant': {
        const out = grantApproval(db, {
          exactAction: str(flags.action, 'approval grant requires --action'),
          target: str(flags.target, 'approval grant requires --target'),
          payload: typeof flags.payload === 'string' ? JSON.parse(flags.payload) : null,
          maxCostKrw: Number(flags['max-cost'] ?? 0),
          expiresAt: str(flags.expires, 'approval grant requires --expires (ISO)'),
          maxUses: Number(flags['max-uses'] ?? 1),
          rollbackPlan: str(flags.rollback, 'approval grant requires --rollback'),
          ownerPacketRef: str(flags.packet, 'approval grant requires --packet (the Owner Packet that authorised it)'),
        });
        print(out, json);
        return 0;
      }
      case 'approval list': {
        print(approvalList(db), json);
        return 0;
      }
      case 'approval revoke': {
        const id = positional[2] ?? flags.id;
        if (typeof id !== 'string') throw new Error('approval revoke requires an approval id');
        print(revokeApproval(db, id, str(flags.reason, 'approval revoke requires --reason')), json);
        return 0;
      }
      case 'admit check': {
        const out = admissionCheck(db, {
          goal: str(flags.goal, 'admit check requires --goal'),
          authority: str(flags.authority, 'admit check requires --authority'),
          methodClass: typeof flags['method-class'] === 'string' ? flags['method-class'] : 'SAFE',
          method: typeof flags.method === 'string' ? flags.method : null,
          budgetProfileId: typeof flags.budget === 'string' ? flags.budget : 'BP-LOCAL',
          costP90Krw: flags.cost === undefined ? 0 : Number(flags.cost),
          approvalId: typeof flags.approval === 'string' ? flags.approval : null,
          exactAction: typeof flags.action === 'string' ? flags.action : null,
          target: typeof flags.target === 'string' ? flags.target : null,
          payloadHash: typeof flags.payload === 'string' ? sha256Json(JSON.parse(flags.payload)) : sha256(''),
          actor: typeof flags.actor === 'string' ? flags.actor : 'cli',
          resource: typeof flags.resource === 'string' ? flags.resource : null,
        });
        print(out, json);
        return out.decision === 'ALLOW' ? 0 : 1;
      }
      case 'admit report': {
        print(admissionReport(db, { limit: Number(flags.limit ?? 20) }), json);
        return 0;
      }
      case 'redteam report': {
        const acceptance = g3Acceptance(db);
        print(
          {
            acceptance,
            probes: redteamProbes(db, {
              bypassClass: typeof flags.class === 'string' ? flags.class : null,
            }),
          },
          json,
        );
        return acceptance.problems.length === 0 ? 0 : 1;
      }
      case 'queue add': {
        print(
          enqueueJob(db, {
            kind: str(flags.kind, 'queue add needs --kind'),
            payload: typeof flags.payload === 'string' ? JSON.parse(flags.payload) : {},
            queue: typeof flags.queue === 'string' ? flags.queue : undefined,
            authority: typeof flags.authority === 'string' ? flags.authority : undefined,
            maxAttempts: flags['max-attempts'] ? Number(flags['max-attempts']) : undefined,
          }),
          json,
        );
        return 0;
      }
      case 'queue claim': {
        const job = claimNextJob(db, {
          worker: str(flags.worker, 'queue claim needs --worker'),
          queue: typeof flags.queue === 'string' ? flags.queue : undefined,
          leaseMs: flags['lease-ms'] ? Number(flags['lease-ms']) : undefined,
        });
        print(job ?? { leased: null, reason: 'nothing runnable (or the emergency stop is engaged)' }, json);
        return job ? 0 : 1;
      }
      case 'queue done': {
        print(
          completeJob(db, {
            jobId: str(flags.job, 'queue done needs --job'),
            worker: str(flags.worker, 'queue done needs --worker'),
            leaseToken: Number(flags.token),
            artifactRef: typeof flags.artifact === 'string' ? flags.artifact : null,
          }),
          json,
        );
        return 0;
      }
      case 'queue fail': {
        print(
          failJob(db, {
            jobId: str(flags.job, 'queue fail needs --job'),
            worker: str(flags.worker, 'queue fail needs --worker'),
            leaseToken: Number(flags.token),
            error: str(flags.error, 'queue fail needs --error'),
          }),
          json,
        );
        return 0;
      }
      case 'queue reclaim': {
        print(reclaimStuckJobs(db, { queue: typeof flags.queue === 'string' ? flags.queue : null }), json);
        return 0;
      }
      case 'queue cancel': {
        print(
          cancelJob(db, str(flags.job, 'queue cancel needs --job'), str(flags.reason, 'queue cancel needs --reason')),
          json,
        );
        return 0;
      }
      case 'queue effect': {
        const effectId = str(flags.effect, 'queue effect needs --effect');
        const evidence = str(flags.evidence, 'queue effect needs --evidence');
        const settle = flags.abandon === true ? abandonEffect : commitEffect;
        print(settle(db, effectId, evidence), json);
        return 0;
      }
      case 'queue scheduler': {
        const enable = flags.enable === true;
        setScheduler(db, enable, str(flags.reason, 'queue scheduler needs --reason'), 'owner');
        print(queueReport(db).scheduler, json);
        return 0;
      }
      case 'schedule add': {
        print(
          createSchedule(db, {
            name: str(flags.name, 'schedule add needs --name'),
            kind: str(flags.kind, 'schedule add needs --kind'),
            intervalMs: Number(str(flags['interval-ms'], 'schedule add needs --interval-ms')),
            reason: str(flags.reason, 'schedule add needs --reason'),
            payload: typeof flags.payload === 'string' ? JSON.parse(flags.payload) : {},
            queue: typeof flags.queue === 'string' ? flags.queue : undefined,
            authority: typeof flags.authority === 'string' ? flags.authority : undefined,
            catchup: flags.catchup === true,
            enabled: flags.arm === true,
          }),
          json,
        );
        return 0;
      }
      case 'schedule arm':
      case 'schedule disarm': {
        print(
          setScheduleEnabled(
            db,
            str(flags.name, 'schedule arm needs --name'),
            command === 'schedule arm',
            str(flags.reason, 'schedule arm needs --reason'),
          ),
          json,
        );
        return 0;
      }
      case 'schedule tick': {
        print(tickScheduler(db), json);
        return 0;
      }
      case 'schedule report': {
        const acceptance = schedulerAcceptance(db);
        print({ ...scheduleReport(db), acceptance }, json);
        return acceptance.ok ? 0 : 1;
      }
      case 'queue report': {
        const acceptance = g4Acceptance(db);
        print({ ...queueReport(db, { queue: typeof flags.queue === 'string' ? flags.queue : null }), acceptance }, json);
        return acceptance.problems.length === 0 ? 0 : 1;
      }
      case 'portfolio adapter': {
        print(
          registerAdapter(db, {
            projectId: str(flags.project, 'portfolio adapter needs --project'),
            kind: str(flags.kind, 'portfolio adapter needs --kind'),
            enabled: flags.enable === true,
            note: typeof flags.note === 'string' ? flags.note : '',
          }),
          json,
        );
        return 0;
      }
      case 'portfolio demand': {
        print(
          recordDemandEvidence(db, {
            projectId: str(flags.project, 'portfolio demand needs --project'),
            kind: str(flags.kind, 'portfolio demand needs --kind DEMAND|UTILITY'),
            metric: str(flags.metric, 'portfolio demand needs --metric'),
            value: Number(str(String(flags.value ?? ''), 'portfolio demand needs --value')),
            sourceRef: str(flags.source, 'portfolio demand needs --source: a number with no source is not evidence'),
            detail: typeof flags.detail === 'string' ? flags.detail : '',
          }),
          json,
        );
        return 0;
      }
      case 'portfolio activate': {
        const out = setProjectStatus(
          db,
          str(flags.project, 'portfolio activate needs --project'),
          str(flags.status, 'portfolio activate needs --status'),
          str(flags.reason, 'portfolio activate needs --reason'),
        );
        print(out, json);
        return out.changed || out.idempotent ? 0 : 1;
      }
      case 'portfolio run': {
        const artifactDir = typeof flags['artifact-dir'] === 'string' ? flags['artifact-dir'] : 'artifacts/portfolio';
        const out = runPortfolioCycle(db, {
          projectId: str(flags.project, 'portfolio run needs --project'),
          adapterKind: str(flags.kind, 'portfolio run needs --kind'),
          sourceVersionId: str(flags['source-version'], 'portfolio run needs --source-version'),
          worker: typeof flags.worker === 'string' ? flags.worker : 'portfolio-cli',
          verify: makeArtifactVerifier({ dbPath, artifactDir }),
        });
        print(out, json);
        return out.ran && out.cycle.outcome === 'USEFUL' ? 0 : 1;
      }
      case 'portfolio report': {
        const acceptance = g7Acceptance(db);
        print({ ...portfolioReport(db), acceptance }, json);
        return acceptance.ok ? 0 : 1;
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
