#!/usr/bin/env node
// Scheduler supervisor soak.
//
//   node scripts/supervisor-soak.mjs --cycles 6 --soak-ref VSOAK-G4-001
//
// 0014's soak restarted the daemon by hand, so the evidence only covered a
// world with a human in it. This soak removes the human from the restart path
// and kills three different things:
//
//   - the daemon child, while the supervisor keeps running: the supervisor must
//     notice, back off, and start a *different* process (a new pid) that keeps
//     serving boundaries;
//   - the whole supervision tree at once (SIGKILL to the process group), which
//     is what a power cut or a hard reboot looks like from the database's side:
//     nothing local can recover it, so the next cycle's fresh supervisor plays
//     the part of the next boot and must find the Owner's switches, the armed
//     schedule and the fire history exactly as they were left;
//   - the tree cleanly with SIGTERM on the last cycle, so a graceful shutdown
//     sits on the record next to the violent ones.
//
// The property under test spans the whole soak: across every death, restart and
// "boot", no boundary is served twice, no job serves two boundaries, and the
// work still moves forward.
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
const SUPERVISOR = join(REPO, 'scripts', 'scheduler-supervisor.mjs');
const MIGRATIONS = join(REPO, 'migrations');

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1]);
const cycles = Number(args.get('cycles') ?? 6);
const tickMs = Number(args.get('tick-ms') ?? 100);
const intervalMs = Number(args.get('interval-ms') ?? 1000);
const kernelDbPath = args.get('db') ?? process.env.YENO_DB ?? 'state/yeno.db';
const soakRef = args.get('soak-ref') ?? newId('VSOAK');
const record = !args.has('no-record');

const scratchDir = mkdtempSync(join(tmpdir(), 'yeno-supervisor-soak-'));
const scratchDb = join(scratchDir, 'yeno.db');

const kernel = openDb(kernelDbPath);
migrate(kernel, MIGRATIONS);

const db = openDb(scratchDb);
migrate(db, MIGRATIONS);
// A fresh install is stopped with the scheduler off. The soak turns both on
// once, explicitly, with Owner reasons — and never again: every later cycle
// depends on those decisions having survived the kills.
setStop(db, false, `supervisor soak ${soakRef}`, 'owner');
setScheduler(db, true, `supervisor soak ${soakRef}`, 'owner');

const name = `supervised.${soakRef}`;
const schedule = createSchedule(db, {
  name,
  kind: 'soak.supervisor',
  intervalMs,
  reason: `supervisor restart soak ${soakRef}`,
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
      'SELECT COUNT(*) AS n FROM (SELECT job_id FROM schedule_fires WHERE schedule_id = ? GROUP BY job_id HAVING COUNT(DISTINCT due_at) > 1)',
    )
    .get(schedule.schedule_id).n;
const jobsForSchedule = () => db.prepare('SELECT COUNT(*) AS n FROM jobs WHERE dedupe_key LIKE ?').get(`sched:${name}@%`).n;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function startSupervisor() {
  // detached: the supervisor leads its own process group, so the soak can kill
  // the whole tree at once the way a power cut does.
  const child = spawn(
    process.execPath,
    [SUPERVISOR, '--db', scratchDb, '--migrations', MIGRATIONS, '--tick-ms', String(tickMs)],
    { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'], detached: true },
  );
  let out = '';
  const onData = (chunk) => {
    out += chunk;
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  return {
    child,
    output: () => out,
    childPids: () => [...new Set([...out.matchAll(/child_started=(\d+)/g)].map((m) => Number(m[1])))],
    restarts: () => [...out.matchAll(/restart_in=/g)].length,
  };
}

async function waitFor(predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await wait(50);
  }
  return false;
}

const results = [];
try {
  for (let cycle = 1; cycle <= cycles; cycle += 1) {
    // Cycle 1 kills the daemon under a live supervisor, cycle 2 kills the whole
    // tree, and so on; the final cycle shuts down cleanly.
    const death = cycle === cycles ? 'clean' : cycle % 2 === 1 ? 'child' : 'supervisor';
    const before = fireCount();
    const startedAt = Date.now();
    const sup = startSupervisor();
    const exited = new Promise((resolve) => sup.child.on('exit', (code, signal) => resolve({ code, signal })));

    await waitFor(() => sup.childPids().length >= 1, 5_000);
    let killed = false;

    if (death === 'child') {
      // Let a boundary or two go by, then kill the daemon and require the
      // supervisor to produce a genuinely new process that keeps working.
      await wait(intervalMs + Math.floor(Math.random() * intervalMs));
      const first = sup.childPids()[0];
      try {
        if (first) process.kill(first, 'SIGKILL');
        killed = true;
      } catch {
        killed = false;
      }
      const replaced = await waitFor(() => sup.childPids().length >= 2, 10_000);
      // The replacement has to do real work, not merely exist.
      if (replaced) await waitFor(() => fireCount() > before, 10_000);
      await wait(intervalMs);
      sup.child.kill('SIGTERM');
    } else if (death === 'supervisor') {
      await wait(intervalMs + Math.floor(Math.random() * intervalMs));
      try {
        // Negative pid: the supervisor and its daemon die in the same instant,
        // with no chance to clean anything up.
        process.kill(-sup.child.pid, 'SIGKILL');
        killed = true;
      } catch {
        killed = false;
      }
    } else {
      await wait(intervalMs + Math.floor(Math.random() * intervalMs));
      sup.child.kill('SIGTERM');
      killed = true;
    }

    const { signal } = await Promise.race([exited, wait(15_000).then(() => ({ signal: 'timeout' }))]);
    // Nothing may outlive its cycle, or the next cycle would be measuring two
    // supervision trees at once.
    try {
      process.kill(-sup.child.pid, 'SIGKILL');
    } catch {
      /* already gone */
    }
    await wait(200);

    const ranMs = Date.now() - startedAt;
    const after = fireCount();
    const served = after - before;
    const pids = sup.childPids();
    const restarts = sup.restarts();
    const dupBoundaries = duplicateBoundaries();
    const dupJobs = duplicateJobs();
    const regressed = after < before ? 1 : 0;
    const ok =
      killed &&
      dupBoundaries === 0 &&
      dupJobs === 0 &&
      regressed === 0 &&
      (death !== 'child' || (restarts >= 1 && pids.length >= 2));
    const detail = `death=${death} sup_signal=${signal} ran_ms=${ranMs} served=${served} restarts=${restarts} pids=${pids.join(',')} fires=${after} jobs=${jobsForSchedule()}`;

    if (record) {
      kernel
        .prepare(
          `INSERT INTO supervisor_soak_cycles (cycle_id, soak_ref, cycle, death, killed, restarts,
             distinct_child_pids, ran_ms, boundaries_served, duplicate_boundaries, duplicate_jobs,
             fires_regressed, ok, detail, recorded_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          newId('VSC'),
          soakRef,
          cycle,
          death,
          killed ? 1 : 0,
          restarts,
          pids.length,
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
// A soak where nothing ever fired would satisfy every duplicate check while
// proving nothing, so lack of progress is itself a failure.
if (served < cycles) process.stdout.write(`SUPERVISOR_SOAK_NO_PROGRESS served=${served} cycles=${cycles}\n`);
const pass = failed.length === 0 && results.length === cycles && served >= cycles;
process.stdout.write(
  pass ? `SUPERVISOR_SOAK_PASS ${results.length}/${cycles} boundaries=${served}\n` : `SUPERVISOR_SOAK_FAIL ${failed.length}\n`,
);
process.exit(pass ? 0 : 1);
