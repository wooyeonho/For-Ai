#!/usr/bin/env node
// Fault-injection helper: writes deterministic events and then kills its own
// process without cleanup, so restart/replay behaviour can be tested for real.
import { openDb } from '../src/core/db.mjs';
import { migrate } from '../src/core/migrate.mjs';
import { appendEvent } from '../src/core/events.mjs';
import { catchUp } from '../src/core/projections.mjs';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1]);

const dbPath = args.get('db');
const total = Number(args.get('events') ?? 5);
const killAfter = args.get('kill-after') === undefined ? null : Number(args.get('kill-after'));
const prefix = args.get('prefix') ?? 'EVT-crash';

const db = openDb(dbPath);
migrate(db, args.get('migrations') ?? 'migrations');

for (let i = 1; i <= total; i += 1) {
  appendEvent(db, {
    eventId: `${prefix}-${i}`,
    type: 'inbox.recorded',
    actor: 'crash-writer',
    authority: 'A2',
    payload: { inbox_id: `IN-${i}`, title: `crash item ${i}`, state: 'BODY_MISSING' },
  });
  catchUp(db);
  if (killAfter !== null && i === killAfter) {
    process.stdout.write(`killed-after=${i}\n`);
    process.kill(process.pid, 'SIGKILL');
  }
}

process.stdout.write(`completed=${total}\n`);
db.close();
