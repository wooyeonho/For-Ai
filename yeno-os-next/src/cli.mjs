#!/usr/bin/env node
import { argv, exit, stdout } from 'node:process';
import { openDb, DEFAULT_DB_PATH } from './core/db.mjs';
import { migrate, MIGRATIONS_DIR, appliedMigrations } from './core/migrate.mjs';
import { appendEvent, readEvents, verifyChain } from './core/events.mjs';
import { catchUp, rebuild } from './core/projections.mjs';
import { createBackup, verifyBackup, restoreBackup } from './core/backup.mjs';
import { setStop, stopEngaged } from './core/governor.mjs';
import { statusReport, verifyReport } from './domain/status.mjs';

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
