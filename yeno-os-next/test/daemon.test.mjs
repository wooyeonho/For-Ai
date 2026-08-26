// The scheduler daemon: the loop that keeps ticking with nobody watching.
//
// The daemon is the first component that runs unattended, so the tests here are
// mostly about what it refuses to do — and about the evidence table refusing to
// hold a flattering lie about a soak that never really crashed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './helpers.mjs';
import { setStop } from '../src/core/governor.mjs';
import { setScheduler } from '../src/domain/workflow.mjs';
import { createSchedule, runSchedulerDaemon } from '../src/domain/scheduler.mjs';

/** No real waiting: the loop's sleep is injected so the tests stay instant. */
const noSleep = () => Promise.resolve();

function armedSchedule(db, name = 'daemon.test') {
  return createSchedule(db, {
    name,
    kind: 'soak.daemon',
    intervalMs: 1_000,
    reason: 'daemon test schedule',
    enabled: true,
    firstDueAt: new Date(Date.now() - 1_000).toISOString(),
  });
}

test('a daemon on a fresh install ticks forever and produces nothing', async () => {
  const { db, cleanup } = freshDb();
  try {
    // Fresh install: stop engaged, scheduler off. Even an armed schedule is inert.
    setStop(db, false, 'arming a schedule for the test', 'owner');
    armedSchedule(db);
    setStop(db, true, 'back to the shipped default', 'owner');

    const refusals = [];
    const summary = await runSchedulerDaemon(
      db,
      { maxTicks: 5, sleep: noSleep, onOutcome: (o) => refusals.push(o.refused) },
    );
    assert.equal(summary.ticks, 5);
    assert.equal(summary.served, 0);
    assert.deepEqual(refusals, Array(5).fill('EMERGENCY_STOP'));
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM schedule_fires').get().n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM jobs').get().n, 0);
  } finally {
    cleanup();
  }
});

test('a daemon with the stop released still refuses while the master switch is off', async () => {
  const { db, cleanup } = freshDb();
  try {
    setStop(db, false, 'daemon test', 'owner');
    armedSchedule(db);
    const refusals = [];
    await runSchedulerDaemon(db, { maxTicks: 3, sleep: noSleep, onOutcome: (o) => refusals.push(o.refused) });
    assert.deepEqual(refusals, ['SCHEDULER_OFF', 'SCHEDULER_OFF', 'SCHEDULER_OFF']);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM schedule_fires').get().n, 0);
  } finally {
    cleanup();
  }
});

test('a daemon serves each boundary exactly once as time advances', async () => {
  const { db, cleanup } = freshDb();
  try {
    setStop(db, false, 'daemon test', 'owner');
    setScheduler(db, true, 'daemon test', 'owner');
    const schedule = armedSchedule(db, 'daemon.advance');

    // A clock the test drives: three boundaries become due over eight ticks, so
    // most ticks find nothing and the ones that do must not double-serve.
    let now = Date.parse(schedule.next_due_at);
    const clock = { now: () => now };
    await runSchedulerDaemon(
      db,
      { maxTicks: 8, sleep: noSleep, onOutcome: () => { now += 400; } },
      clock,
    );

    const fires = db
      .prepare('SELECT due_at, COUNT(*) AS n FROM schedule_fires WHERE schedule_id = ? GROUP BY due_at')
      .all(schedule.schedule_id);
    assert.ok(fires.length >= 2, `expected progress, got ${fires.length} boundaries`);
    for (const row of fires) assert.equal(row.n, 1, `boundary ${row.due_at} served ${row.n} times`);
    // One job per boundary, by dedupe key — no boundary produced a second job.
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE dedupe_key LIKE 'sched:daemon.advance@%'").get().n, fires.length);
  } finally {
    cleanup();
  }
});

test('shouldStop ends the loop between ticks without a signal', async () => {
  const { db, cleanup } = freshDb();
  try {
    setStop(db, false, 'daemon test', 'owner');
    setScheduler(db, true, 'daemon test', 'owner');
    let stop = false;
    const summary = await runSchedulerDaemon(db, {
      maxTicks: 100,
      sleep: noSleep,
      shouldStop: () => stop,
      onOutcome: () => { stop = true; },
    });
    assert.equal(summary.ticks, 1);
  } finally {
    cleanup();
  }
});

test('daemon soak evidence cannot claim a pass it did not earn', () => {
  const { db, cleanup } = freshDb();
  try {
    const insert = (row) =>
      db
        .prepare(
          `INSERT INTO daemon_soak_cycles (cycle_id, soak_ref, cycle, death, killed, ran_ms,
             boundaries_served, duplicate_boundaries, duplicate_jobs, fires_regressed, ok, detail, recorded_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          row.cycle_id,
          'DSOAK-TEST',
          row.cycle,
          row.death ?? 'sigkill',
          row.killed ?? 1,
          10,
          row.served ?? 1,
          row.dup ?? 0,
          row.dupJobs ?? 0,
          row.regressed ?? 0,
          row.ok ?? 1,
          'test row',
          new Date().toISOString(),
        );

    // A pass that never crashed, a pass with a doubled boundary, a pass with a
    // job serving two boundaries, and a pass where the fire count went backwards.
    assert.throws(() => insert({ cycle_id: 'DSC-1', cycle: 1, killed: 0 }), /real death/);
    assert.throws(() => insert({ cycle_id: 'DSC-2', cycle: 2, dup: 1 }), /real death/);
    assert.throws(() => insert({ cycle_id: 'DSC-3', cycle: 3, dupJobs: 1 }), /real death/);
    assert.throws(() => insert({ cycle_id: 'DSC-4', cycle: 4, regressed: 1 }), /real death/);

    // An honest failing row is allowed — that is how a bad cycle gets recorded.
    insert({ cycle_id: 'DSC-5', cycle: 5, killed: 0, dup: 1, ok: 0 });
    insert({ cycle_id: 'DSC-6', cycle: 6 });
    assert.throws(() => db.prepare('UPDATE daemon_soak_cycles SET ok = 1 WHERE cycle_id = ?').run('DSC-5'), /append-only/);
    assert.throws(() => db.prepare('DELETE FROM daemon_soak_cycles WHERE cycle_id = ?').run('DSC-5'), /cannot be deleted/);
  } finally {
    cleanup();
  }
});
