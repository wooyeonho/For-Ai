#!/usr/bin/env node
// Scheduler daemon restart soak.
//
//   node scripts/daemon-soak.mjs --cycles 8 --soak-ref DSOAK-G4-001
//
// 0013's soak killed a single tick at the two dangerous instants. This one is
// the next claim up, and closer to how YENO is meant to live: a *long-running*
// daemon serving a schedule that keeps coming due, SIGKILLed at an arbitrary
// moment over and over, with a brand new daemon taking over each time as if the
// machine had restarted. The property under test spans the whole soak, not one
// cycle: across every death and restart, no boundary is ever served twice, no
// job serves two boundaries, and the work still makes progress.
//
// The last cycle ends the daemon cleanly with SIGTERM, so a graceful shutdown is
// on the record next to the violent ones.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../src/core/db.mjs';
import { migrate } from '../src/core/migrate.mjs';
import { setStop } from '../src/core/governor.mjs';
import { newId, nowIso } from '../src/core/ids.mjs';
import { setScheduler } from '../src/domain/workflow.mjs';
import { createSchedule, schedulerAcceptance } from '../src/domain/scheduler.mjs';

const REPO = new URL('..', import.meta.url).pathname;
const DAEMON = join(REPO, 'scripts', 'scheduler-daemon.mjs');
const MIGRATIONS = join(REPO, 'migrations');

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1]);
const cycles = Number(args.get('cycles') ?? 8);
const tickMs = Number(args.get('tick-ms') ?? 100);
const intervalMs = Number(args.get('interval-ms') ?? 1000);
const kernelDbPath = args.get('db') ?? process.env.YENO_DB ?? 'state/yeno.db';
const soakRef = args.get('soak-ref') ?? newId('DSOAK');
const record = !args.has('no-record');

const scratchDir = mkdtempSync(join(tmpdir(), 'yeno-daemon-soak-'));
const scratchDb = join(scratchDir, 'yeno.db');

const kernel = openDb(kernelDbPath);
migrate(kernel, MIGRATIONS);

const db = openDb(scratchDb);
migrate(db, MIGRATIONS);
// A fresh install is stopped with the scheduler off; the soak turns both on
// explicitly, with Owner reasons, so no default is quietly relied upon.
setStop(db, false, `daemon soak ${soakRef}`, 'owner');
setScheduler(db, true, `daemon soak ${soakRef}`, 'owner');

const name = `daemon.${soakRef}`;
const schedule = createSchedule(db, {
  name,
  kind: 'soak.daemon',
  intervalMs,
  reason: `daemon restart soak ${soakRef}`,
  enabled: true,
  firstDueAt: new Date(Date.now() - 1_000).toISOString(),
});

const fireCount = () =>
  db.prepare('SELECT COUNT(*) AS n FROM schedule_fires WHERE schedule_id = ?').get(schedule.schedule_id).n;
const duplicateBoundaries = () =>
  db
    .prepare(
      'SELECT COUNT(*) AS n FROM (SELECT due_at FROM schedule_fires WHERE schedule_id = ? GROUP BY due_at HAVING COUNT(*) > 1)',
    )
    .get(schedule.schedule_id).n;
const duplicateJobs = () =>
  db
    .prepare(
      "SELECT COUNT(*) AS n FROM (SELECT job_id FROM schedule_fires WHERE schedule_id = ? GROUP BY job_id HAVING COUNT(DISTINCT due_at) > 1)",
    )
    .get(schedule.schedule_id).n;
const jobsForSchedule = () =>
  db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE dedupe_key LIKE ?").get(`sched:${name}@%`).n;

function runDaemon() {
  const child = spawn(process.execPath, [DAEMON, '--db', scratchDb, '--migrations', MIGRATIONS, '--tick-ms', String(tickMs)], {
    cwd: REPO,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (chunk) => {
    out += chunk;
  });
  child.stderr.on('data', (chunk) => {
    out += chunk;
  });
  return { child, output: () => out };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const results = [];
try {
  for (let cycle = 1; cycle <= cycles; cycle += 1) {
    const death = cycle === cycles ? 'clean' : 'sigkill';
    const before = fireCount();
    const startedAt = Date.now();
    const { child, output } = runDaemon();
    const exited = new Promise((resolve) => child.on('exit', (code, signal) => resolve({ code, signal })));

    // Kill at an arbitrary point inside a boundary window rather than at a tidy
    // moment: the interesting crashes are the ones nobody chose.
    const liveMs = intervalMs + Math.floor(Math.random() * intervalMs);
    await wait(liveMs);
    child.kill(death === 'sigkill' ? 'SIGKILL' : 'SIGTERM');
    const { signal } = await Promise.race([exited, wait(5_000).then(() => ({ signal: null }))]);
    const ranMs = Date.now() - startedAt;

    const after = fireCount();
    const served = after - before;
    const dupBoundaries = duplicateBoundaries();
    const dupJobs = duplicateJobs();
    const regressed = after < before ? 1 : 0;
    const killed = death === 'sigkill' ? signal === 'SIGKILL' : true;
    const ok = killed && dupBoundaries === 0 && dupJobs === 0 && regressed === 0;
    const detail = `death=${death} signal=${signal} ran_ms=${ranMs} served=${served} fires=${after} jobs=${jobsForSchedule()} tail=${(output().trim().split('\n').pop() ?? '').slice(0, 120)}`;

    if (record) {
      kernel
        .prepare(
          `INSERT INTO daemon_soak_cycles (cycle_id, soak_ref, cycle, death, killed, ran_ms,
             boundaries_served, duplicate_boundaries, duplicate_jobs, fires_regressed, ok, detail, recorded_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          newId('DSC'),
          soakRef,
          cycle,
          death,
          killed ? 1 : 0,
          ranMs,
          served,
          dupBoundaries,
          dupJobs,
          regressed,
          ok ? 1 : 0,
          detail,
          nowIso(Date),
        );
    }
    results.push({ cycle, ok, served, detail });
    process.stdout.write(`cycle ${cycle}: ${ok ? 'PASS' : 'FAIL'} ${detail}\n`);
  }
} finally {
  const totalServed = results.reduce((sum, r) => sum + r.served, 0);
  const acceptance = schedulerAcceptance(db);
  process.stdout.write(`\n${JSON.stringify({ soak_ref: soakRef, total_boundaries_served: totalServed, acceptance }, null, 2)}\n`);
  db.close();
  kernel.close();
  if (!args.has('keep-scratch')) rmSync(scratchDir, { recursive: true, force: true });
}

const served = results.reduce((sum, r) => sum + r.served, 0);
const failed = results.filter((r) => !r.ok);
// A soak where nothing ever fired would pass every duplicate check while proving
// nothing, so lack of progress is itself a failure.
if (served < cycles) process.stdout.write(`DAEMON_SOAK_NO_PROGRESS served=${served} cycles=${cycles}\n`);
const pass = failed.length === 0 && results.length === cycles && served >= cycles;
process.stdout.write(pass ? `DAEMON_SOAK_PASS ${results.length}/${cycles} boundaries=${served}\n` : `DAEMON_SOAK_FAIL ${failed.length}\n`);
process.exit(pass ? 0 : 1);
