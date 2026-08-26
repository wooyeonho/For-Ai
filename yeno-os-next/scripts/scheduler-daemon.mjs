#!/usr/bin/env node
// A long-running scheduler daemon: the shape the real thing has to run in.
//
//   node scripts/scheduler-daemon.mjs --tick-ms 200
//
// It arms nothing and releases nothing. Every tick goes through tickScheduler,
// so a daemon started on a fresh install prints `refused=EMERGENCY_STOP` or
// `refused=SCHEDULER_OFF` forever and produces no work — the Owner's two
// switches are the only thing that lets it act. SIGTERM/SIGINT end it cleanly
// between ticks; a SIGKILL is the case the soak cares about.
import { openDb } from '../src/core/db.mjs';
import { migrate } from '../src/core/migrate.mjs';
import { runSchedulerDaemon } from '../src/domain/scheduler.mjs';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1]);

const db = openDb(args.get('db'));
migrate(db, args.get('migrations') ?? 'migrations');

let stopping = false;
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    stopping = true;
    process.stdout.write(`stopping=${signal}\n`);
  });
}

const summary = await runSchedulerDaemon(db, {
  tickMs: Number(args.get('tick-ms') ?? 250),
  maxTicks: args.has('max-ticks') ? Number(args.get('max-ticks')) : Infinity,
  shouldStop: () => stopping,
  onOutcome: (outcome) => {
    // One line per tick so a supervisor can see progress and, after a kill, know
    // exactly how far the dead process got.
    for (const fire of outcome.fired) {
      process.stdout.write(`fired=${fire.schedule}@${fire.due_at} job=${fire.job_id ?? 'none'}${fire.already_fired ? ' already_fired=1' : ''}\n`);
    }
    if (outcome.refused) process.stdout.write(`refused=${outcome.refused}\n`);
  },
});

process.stdout.write(`daemon_exit=${JSON.stringify(summary)}\n`);
db.close();
