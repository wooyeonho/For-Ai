#!/usr/bin/env node
// Scheduler crash soak. Each cycle arms one schedule that already owes exactly
// one occurrence, runs a real ticking process, SIGKILLs it at one of the two
// dangerous moments, then lets a fresh process tick the same owed boundary again.
//
//   node scripts/scheduler-soak.mjs --cycles 8
//
// The claim under test is not "the tick finishes" but "one boundary produces one
// job, no matter where the process died". The schedules live in a scratch DB so
// the soak never mutates the kernel ledger; only the per-cycle evidence rows do.
import { spawnSync } from 'node:child_process';
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
const TICKER = join(REPO, 'scripts', 'scheduler-tick-worker.mjs');
const MIGRATIONS = join(REPO, 'migrations');

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1]);
const cycles = Number(args.get('cycles') ?? 8);
const kernelDbPath = args.get('db') ?? process.env.YENO_DB ?? 'state/yeno.db';
const soakRef = args.get('soak-ref') ?? newId('SSOAK');
const record = !args.has('no-record');

const scratchDir = mkdtempSync(join(tmpdir(), 'yeno-sched-soak-'));
const scratchDb = join(scratchDir, 'yeno.db');

const kernel = openDb(kernelDbPath);
migrate(kernel, MIGRATIONS);

const schedDb = openDb(scratchDb);
migrate(schedDb, MIGRATIONS);
// A fresh install is stopped and the scheduler is off; the soak turns both on
// explicitly so neither default is quietly relied upon.
setStop(schedDb, false, `scheduler soak ${soakRef}`, 'owner');
setScheduler(schedDb, true, `scheduler soak ${soakRef}`, 'owner');

function tick(extra) {
  return spawnSync(process.execPath, [TICKER, '--db', scratchDb, '--migrations', MIGRATIONS, ...extra], {
    cwd: REPO,
    encoding: 'utf8',
  });
}

const results = [];
try {
  for (let cycle = 1; cycle <= cycles; cycle += 1) {
    const killPoint = cycle % 2 === 0 ? 'after-commit' : 'in-transaction';
    const name = `soak.${soakRef}.${cycle}`;
    // Owed by one second, so exactly one boundary is due right now.
    const schedule = createSchedule(schedDb, {
      name,
      kind: 'soak.scheduled',
      intervalMs: 60_000,
      reason: `scheduler crash soak ${soakRef} cycle ${cycle}`,
      enabled: true,
      firstDueAt: new Date(Date.now() - 1_000).toISOString(),
    });
    const dueAt = schedule.next_due_at;

    const first = tick(['--kill-at', killPoint]);
    const killed = /^killed=/m.test(first.stdout ?? '');
    if (!killed) process.stderr.write(`cycle ${cycle}: ticker did not crash as instructed\n${first.stdout}${first.stderr}\n`);

    // A reboot: nothing was cleaned up, a brand new process ticks again.
    const second = tick([]);
    const resumed = (second.stdout ?? '').trim().split('\n').pop() ?? '';

    const fires = schedDb
      .prepare('SELECT COUNT(*) AS n FROM schedule_fires WHERE schedule_id = ? AND due_at = ?')
      .get(schedule.schedule_id, dueAt).n;
    const jobs = schedDb
      .prepare("SELECT COUNT(*) AS n FROM jobs WHERE dedupe_key = ?")
      .get(`sched:${name}@${dueAt}`).n;
    // Either the crash rolled the occurrence back and the restart served it, or
    // the crash committed it and the restart left it alone. Both end at one.
    const ok = killed && fires === 1 && jobs === 1;
    const detail = `kill=${killPoint} killed=${killed} fires=${fires} jobs=${jobs} resumed=${resumed.slice(0, 160)}`;

    if (record) {
      kernel
        .prepare(
          `INSERT INTO schedule_soak_cycles (cycle_id, soak_ref, cycle, kill_point, killed,
             jobs_for_boundary, fires_for_boundary, ok, detail, recorded_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(newId('SSC'), soakRef, cycle, killPoint, killed ? 1 : 0, jobs, fires, ok ? 1 : 0, detail, nowIso(Date));
    }
    results.push({ cycle, ok, detail });
    process.stdout.write(`cycle ${cycle}: ${ok ? 'PASS' : 'FAIL'} ${detail}\n`);
  }
} finally {
  process.stdout.write(`\n${JSON.stringify({ soak_ref: soakRef, acceptance: schedulerAcceptance(schedDb) }, null, 2)}\n`);
  schedDb.close();
  kernel.close();
  if (!args.has('keep-scratch')) rmSync(scratchDir, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
process.stdout.write(failed.length === 0 ? `SCHEDULER_SOAK_PASS ${results.length}/${cycles}\n` : `SCHEDULER_SOAK_FAIL ${failed.length}\n`);
process.exit(failed.length === 0 && results.length === cycles ? 0 : 1);
