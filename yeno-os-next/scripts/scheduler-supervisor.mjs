#!/usr/bin/env node
// Supervisor for the scheduler daemon.
//
//   node scripts/scheduler-supervisor.mjs --db state/yeno.db --tick-ms 100
//
// 0014's soak restarted the daemon by hand. This is the process that does it
// when nobody is watching: it starts one daemon, waits, and when that daemon
// dies it starts another after a backoff. It owns no authority of its own — it
// arms no schedule, touches no switch, and opens no database. Everything it
// supervises still refuses to fire unless the Owner turned both switches on, so
// a supervisor left running on a fresh install does nothing forever.
//
// It prints one line per lifecycle event (`child_started`, `child_exit`,
// `restart_in`, `crash_loop`, `supervisor_exit`) so a soak — or a human reading
// a log after a bad night — can reconstruct exactly which process served what.
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { superviseDecision } from '../src/domain/supervisor.mjs';

const REPO = new URL('..', import.meta.url).pathname;
const DAEMON = join(REPO, 'scripts', 'scheduler-daemon.mjs');

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1]);

const dbPath = args.get('db') ?? process.env.YENO_DB ?? 'state/yeno.db';
const migrations = args.get('migrations') ?? join(REPO, 'migrations');
const tickMs = args.get('tick-ms') ?? '250';
const maxRestarts = args.has('max-restarts') ? Number(args.get('max-restarts')) : Infinity;

const say = (line) => process.stdout.write(`${line}\n`);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let stopping = false;
let child = null;
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    stopping = true;
    say(`supervisor_stopping=${signal}`);
    // Pass the stop down rather than orphaning the daemon: the child ends its
    // own tick and exits cleanly, which is the shutdown the soak records.
    if (child && child.exitCode === null) child.kill('SIGTERM');
  });
}

const crashTimes = [];
let restarts = 0;
let exitReason = 'SUPERVISOR_STOPPING';

while (!stopping) {
  child = spawn(
    process.execPath,
    [DAEMON, '--db', dbPath, '--migrations', migrations, '--tick-ms', String(tickMs)],
    { cwd: REPO, stdio: ['ignore', 'inherit', 'inherit'] },
  );
  say(`child_started=${child.pid}`);

  const { code, signal } = await new Promise((resolve) =>
    child.on('exit', (c, s) => resolve({ code: c, signal: s })),
  );
  say(`child_exit=${child.pid} code=${code} signal=${signal}`);

  const crashed = !(signal === null && code === 0);
  if (crashed) crashTimes.push(Date.now());
  const decision = superviseDecision({ code, signal, stopping, crashTimes });

  if (decision.action !== 'restart') {
    exitReason = decision.reason;
    if (decision.action === 'crash_loop') say(`crash_loop=${decision.crashesInWindow}`);
    break;
  }
  if (restarts >= maxRestarts) {
    exitReason = 'MAX_RESTARTS';
    say(`max_restarts=${restarts}`);
    break;
  }

  say(`restart_in=${decision.delayMs} reason=${decision.reason}`);
  await wait(decision.delayMs);
  restarts += 1;
}

say(`supervisor_exit=${JSON.stringify({ restarts, reason: exitReason })}`);
// A crash loop is a failure state, not a tidy end: exit non-zero so an outer
// supervisor (systemd, a Windows service, a human) sees it as one.
process.exit(exitReason === 'DAEMON_CRASH_LOOP' ? 1 : 0);
