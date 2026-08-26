#!/usr/bin/env node
// A real ticking process for the scheduler crash soak. It can SIGKILL itself at
// the two moments that would let one boundary fire twice:
//
//   --kill-at in-transaction  the job and the fire row are written but the
//                             transaction is still open, so a crash must leave
//                             *neither* behind
//   --kill-at after-commit    the transaction committed and the process dies
//                             before it can report anything, so a restart must
//                             find the boundary already served and refuse to
//                             serve it a second time
import { openDb } from '../src/core/db.mjs';
import { migrate } from '../src/core/migrate.mjs';
import { tickScheduler } from '../src/domain/scheduler.mjs';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1]);

const killAt = args.get('kill-at') ?? null;

/** Blocking after the signal request makes the death deterministic. */
function die(where, detail) {
  process.stdout.write(`killed=${where} ${detail}\n`);
  process.kill(process.pid, 'SIGKILL');
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
}

const db = openDb(args.get('db'));
migrate(db, args.get('migrations') ?? 'migrations');

const result = tickScheduler(db, {
  beforeCommit:
    killAt === 'in-transaction'
      ? (ctx) => die('in-transaction', `schedule=${ctx.schedule} due=${ctx.due_at} job=${ctx.job_id}`)
      : null,
});

if (killAt === 'after-commit') die('after-commit', JSON.stringify(result.fired));

process.stdout.write(`ticked=${JSON.stringify(result)}\n`);
db.close();
