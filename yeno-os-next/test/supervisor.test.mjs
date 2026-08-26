// The supervisor: the process that restarts the daemon when nobody is watching.
//
// Two things have to hold. The policy must obey a clean exit and refuse to spin
// forever on a daemon that is broken rather than unlucky, and the evidence table
// must refuse to hold a soak row claiming a restart that never produced a new
// process.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { freshDb } from './helpers.mjs';
import {
  BACKOFF_CAP_MS,
  CRASH_LOOP_LIMIT,
  backoffMs,
  superviseDecision,
} from '../src/domain/supervisor.mjs';

const REPO = new URL('..', import.meta.url).pathname;

test('backoff grows and is capped, so a fast-dying daemon cannot become a spin loop', () => {
  assert.equal(backoffMs(0), 0);
  assert.equal(backoffMs(1, { baseMs: 100 }), 100);
  assert.equal(backoffMs(2, { baseMs: 100 }), 200);
  assert.equal(backoffMs(3, { baseMs: 100 }), 400);
  assert.equal(backoffMs(50), BACKOFF_CAP_MS);
});

test('a clean daemon exit is obeyed, not overridden', () => {
  const decision = superviseDecision({ code: 0, signal: null });
  assert.equal(decision.action, 'stop');
  assert.equal(decision.reason, 'DAEMON_EXITED_CLEANLY');
});

test('a killed daemon is replaced after a backoff', () => {
  const now = 1_000_000;
  const decision = superviseDecision({ code: null, signal: 'SIGKILL', crashTimes: [now], now });
  assert.equal(decision.action, 'restart');
  assert.equal(decision.reason, 'DAEMON_KILLED_SIGKILL');
  assert.ok(decision.delayMs > 0);
});

test('a non-zero exit is treated as a crash even without a signal', () => {
  const now = 1_000_000;
  const decision = superviseDecision({ code: 3, signal: null, crashTimes: [now], now });
  assert.equal(decision.action, 'restart');
  assert.equal(decision.reason, 'DAEMON_EXIT_3');
});

test('a daemon crashing repeatedly inside the window stops supervision instead of hiding it', () => {
  const now = 1_000_000;
  const inWindow = Array.from({ length: CRASH_LOOP_LIMIT }, (_, i) => now - i * 100);
  const looping = superviseDecision({ code: 1, signal: null, crashTimes: inWindow, now });
  assert.equal(looping.action, 'crash_loop');
  assert.equal(looping.reason, 'DAEMON_CRASH_LOOP');

  // The same number of crashes spread outside the window is bad luck, not a
  // broken daemon: supervision continues.
  const spread = Array.from({ length: CRASH_LOOP_LIMIT }, (_, i) => now - (i + 1) * 60_000);
  assert.equal(superviseDecision({ code: 1, signal: null, crashTimes: spread, now }).action, 'restart');
});

test('a stopping supervisor does not restart the daemon it just asked to stop', () => {
  const decision = superviseDecision({ code: null, signal: 'SIGTERM', stopping: true });
  assert.equal(decision.action, 'stop');
  assert.equal(decision.reason, 'SUPERVISOR_STOPPING');
});

test('the supervisor gives up on a daemon that cannot start, and says so with a non-zero exit', () => {
  // A daemon replaced by a process that always fails immediately: the real
  // crash-loop case, run end to end rather than argued about.
  const dir = mkdtempSync(join(tmpdir(), 'yeno-crashloop-'));
  try {
    const fakeDaemon = join(dir, 'scheduler-daemon.mjs');
    writeFileSync(fakeDaemon, 'process.exit(7);\n');
    const scripts = join(dir, 'scripts');
    execFileSync('mkdir', ['-p', scripts]);
    execFileSync('cp', [join(REPO, 'scripts', 'scheduler-supervisor.mjs'), join(scripts, 'scheduler-supervisor.mjs')]);
    execFileSync('cp', [fakeDaemon, join(scripts, 'scheduler-daemon.mjs')]);
    execFileSync('mkdir', ['-p', join(dir, 'src', 'domain')]);
    execFileSync('cp', [join(REPO, 'src', 'domain', 'supervisor.mjs'), join(dir, 'src', 'domain', 'supervisor.mjs')]);

    const run = spawnSync(process.execPath, [join(scripts, 'scheduler-supervisor.mjs'), '--db', join(dir, 'unused.db')], {
      cwd: dir,
      encoding: 'utf8',
      timeout: 60_000,
    });
    assert.match(run.stdout, /crash_loop=/);
    assert.match(run.stdout, /"reason":"DAEMON_CRASH_LOOP"/);
    assert.notEqual(run.status, 0, 'a crash loop must not look like a tidy exit');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('supervisor soak evidence cannot claim a restart that produced no new process', () => {
  const { db, cleanup } = freshDb();
  try {
    const insert = (row) =>
      db
        .prepare(
          `INSERT INTO supervisor_soak_cycles (cycle_id, soak_ref, cycle, death, killed, restarts,
             distinct_child_pids, ran_ms, boundaries_served, duplicate_boundaries, duplicate_jobs,
             fires_regressed, ok, detail, recorded_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          row.cycle_id,
          'VSOAK-TEST',
          row.cycle,
          row.death ?? 'child',
          row.killed ?? 1,
          row.restarts ?? 1,
          row.pids ?? 2,
          10,
          row.served ?? 1,
          row.dup ?? 0,
          row.dupJobs ?? 0,
          row.regressed ?? 0,
          row.ok ?? 1,
          'test row',
          new Date().toISOString(),
        );

    // A death that never happened; a child death answered by no restart; a
    // restart that reused the same pid; a doubled boundary; a job serving two
    // boundaries; a fire count that went backwards.
    assert.throws(() => insert({ cycle_id: 'VSC-1', cycle: 1, killed: 0 }), /real death/);
    assert.throws(() => insert({ cycle_id: 'VSC-2', cycle: 2, restarts: 0 }), /real new process/);
    assert.throws(() => insert({ cycle_id: 'VSC-3', cycle: 3, pids: 1 }), /real new process/);
    assert.throws(() => insert({ cycle_id: 'VSC-4', cycle: 4, dup: 1 }), /duplicated boundary/);
    assert.throws(() => insert({ cycle_id: 'VSC-5', cycle: 5, dupJobs: 1 }), /duplicated boundary/);
    assert.throws(() => insert({ cycle_id: 'VSC-6', cycle: 6, regressed: 1 }), /duplicated boundary/);

    // A tree death has nothing local to restart it, so zero restarts is honest there.
    insert({ cycle_id: 'VSC-7', cycle: 7, death: 'supervisor', restarts: 0, pids: 1 });
    // An honest failing row is allowed — that is how a bad cycle gets recorded.
    insert({ cycle_id: 'VSC-8', cycle: 8, killed: 0, restarts: 0, pids: 1, ok: 0 });

    assert.throws(() => db.prepare('UPDATE supervisor_soak_cycles SET ok = 1 WHERE cycle_id = ?').run('VSC-8'), /append-only/);
    assert.throws(() => db.prepare('DELETE FROM supervisor_soak_cycles WHERE cycle_id = ?').run('VSC-8'), /cannot be deleted/);
  } finally {
    cleanup();
  }
});
