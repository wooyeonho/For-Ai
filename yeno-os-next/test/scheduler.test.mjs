// The durable scheduler. The property under test is that an occurrence fires at
// most once — across racing ticks, replayed clocks and restarts — and that
// nothing fires at all unless both switches are on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './helpers.mjs';
import { setStop } from '../src/core/governor.mjs';
import { setScheduler } from '../src/domain/workflow.mjs';
import {
  createSchedule,
  nextBoundary,
  scheduleReport,
  schedulerAcceptance,
  setScheduleEnabled,
  tickScheduler,
} from '../src/domain/scheduler.mjs';

/** A kernel with the stop released and the master scheduler switch armed. */
function armed() {
  const ctx = freshDb();
  setStop(ctx.db, false, 'scheduler tests', 'owner');
  setScheduler(ctx.db, true, 'scheduler tests', 'owner');
  return ctx;
}

function addDue(db, overrides = {}) {
  return createSchedule(db, {
    name: overrides.name ?? 'nightly.sync',
    kind: 'sync.source',
    intervalMs: 60_000,
    reason: 'test schedule',
    enabled: true,
    // Already owed, so the first tick has something to do.
    firstDueAt: new Date(Date.now() - 1_000).toISOString(),
    ...overrides,
  });
}

test('a schedule is created disarmed unless the Owner arms it with a reason', () => {
  const { db, cleanup } = armed();
  try {
    const s = createSchedule(db, { name: 'idle', kind: 'noop', intervalMs: 60_000, reason: 'created for the test' });
    assert.equal(s.enabled, 0);
    assert.equal(tickScheduler(db).fired.length, 0);
    assert.throws(() => setScheduleEnabled(db, 'idle', true, ''), /needs a reason/);
    assert.equal(setScheduleEnabled(db, 'idle', true, 'owner armed it in a test').enabled, 1);
  } finally {
    cleanup();
  }
});

test('an owed occurrence fires exactly once, and a replayed tick does not double it', () => {
  const { db, cleanup } = armed();
  try {
    const s = addDue(db);
    const first = tickScheduler(db);
    assert.equal(first.fired.length, 1);
    assert.equal(first.fired[0].deduped, false);

    // Immediately ticking again: the next boundary is in the future, so nothing
    // is owed and no second job appears for the boundary already served.
    assert.equal(tickScheduler(db).fired.length, 0);
    const fires = db.prepare('SELECT * FROM schedule_fires WHERE schedule_id = ?').all(s.schedule_id);
    assert.equal(fires.length, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM jobs').get().n, 1);
  } finally {
    cleanup();
  }
});

test('a boundary cannot be recorded twice even with raw SQL', () => {
  const { db, cleanup } = armed();
  try {
    const s = addDue(db);
    tickScheduler(db);
    const fire = db.prepare('SELECT * FROM schedule_fires WHERE schedule_id = ?').get(s.schedule_id);
    assert.throws(
      () =>
        db
          .prepare('INSERT INTO schedule_fires (fire_id, schedule_id, due_at, fired_at, tick_id, job_id, deduped) VALUES (?,?,?,?,?,?,0)')
          .run('SFR-forged', s.schedule_id, fire.due_at, fire.fired_at, 'TICK-forged', fire.job_id),
      /UNIQUE constraint failed/,
    );
    assert.throws(() => db.prepare('DELETE FROM schedule_fires WHERE fire_id = ?').run(fire.fire_id), /append-only|cannot be deleted/);
    assert.throws(() => db.prepare('UPDATE schedule_fires SET due_at = ? WHERE fire_id = ?').run('2000-01-01T00:00:00Z', fire.fire_id), /append-only/);
  } finally {
    cleanup();
  }
});

test('missed time collapses to one owed occurrence instead of a burst', () => {
  const { db, cleanup } = armed();
  try {
    // A day of missed minutes: 1440 boundaries went by while the machine slept.
    addDue(db, { firstDueAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() });
    const fired = tickScheduler(db).fired;
    assert.equal(fired.length, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM jobs').get().n, 1);
    // And the schedule is now owed nothing: the next boundary is in the future.
    assert.equal(tickScheduler(db).fired.length, 0);
  } finally {
    cleanup();
  }
});

test('a catch-up schedule owes one occurrence per tick, never a burst', () => {
  const { db, cleanup } = armed();
  try {
    addDue(db, { name: 'catchup.sync', catchup: true, firstDueAt: new Date(Date.now() - 5 * 60_000).toISOString() });
    for (let i = 1; i <= 3; i += 1) {
      assert.equal(tickScheduler(db).fired.length, 1, `tick ${i} fires exactly one occurrence`);
    }
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM jobs').get().n, 3);
    assert.equal(db.prepare('SELECT COUNT(DISTINCT due_at) AS n FROM schedule_fires').get().n, 3);
  } finally {
    cleanup();
  }
});

test('nothing fires while the master switch is off', () => {
  const { db, cleanup } = armed();
  try {
    const s = addDue(db);
    setScheduler(db, false, 'switching the scheduler off in a test', 'owner');
    const tick = tickScheduler(db);
    assert.equal(tick.refused, 'SCHEDULER_OFF');
    assert.equal(tick.fired.length, 0);
    // Even bypassing the runtime: the schema refuses the fire row.
    assert.throws(
      () =>
        db
          .prepare('INSERT INTO schedule_fires (fire_id, schedule_id, due_at, fired_at, tick_id, job_id, deduped) VALUES (?,?,?,?,?,?,0)')
          .run('SFR-bypass', s.schedule_id, s.next_due_at, s.next_due_at, 'TICK-bypass', 'JOB-none'),
      /the scheduler is off/,
    );
  } finally {
    cleanup();
  }
});

test('nothing fires while the emergency stop is engaged', () => {
  const { db, cleanup } = armed();
  try {
    addDue(db);
    setStop(db, true, 'stopping in a test', 'owner');
    const tick = tickScheduler(db);
    assert.equal(tick.refused, 'EMERGENCY_STOP');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM schedule_fires').get().n, 0);
  } finally {
    cleanup();
  }
});

test('a disarmed schedule cannot fire, by runtime or by raw SQL', () => {
  const { db, cleanup } = armed();
  try {
    const s = addDue(db, { name: 'disarmed.sync' });
    setScheduleEnabled(db, 'disarmed.sync', false, 'disarmed for the test');
    assert.equal(tickScheduler(db).fired.length, 0);
    assert.throws(
      () =>
        db
          .prepare('INSERT INTO schedule_fires (fire_id, schedule_id, due_at, fired_at, tick_id, job_id, deduped) VALUES (?,?,?,?,?,?,0)')
          .run('SFR-disarmed', s.schedule_id, s.next_due_at, s.next_due_at, 'TICK-x', 'JOB-none'),
      /disabled schedule cannot fire/,
    );
  } finally {
    cleanup();
  }
});

test("a schedule's intent is immutable and its clock cannot be rewound", () => {
  const { db, cleanup } = armed();
  try {
    const s = addDue(db, { name: 'immutable.sync' });
    tickScheduler(db);
    assert.throws(() => db.prepare('UPDATE schedules SET kind = ? WHERE schedule_id = ?').run('rm.everything', s.schedule_id), /intent is immutable/);
    assert.throws(() => db.prepare('UPDATE schedules SET payload_json = ? WHERE schedule_id = ?').run('{"evil":1}', s.schedule_id), /intent is immutable/);
    assert.throws(() => db.prepare('UPDATE schedules SET next_due_at = ? WHERE schedule_id = ?').run('2000-01-01T00:00:00Z', s.schedule_id), /cannot move backwards/);
    assert.throws(() => db.prepare('UPDATE schedules SET fire_count = 0 WHERE schedule_id = ?').run(s.schedule_id), /monotonic/);
    assert.throws(() => db.prepare('DELETE FROM schedules WHERE schedule_id = ?').run(s.schedule_id), /never deleted/);
  } finally {
    cleanup();
  }
});

test('boundaries are computed from the schedule timeline, not from tick time', () => {
  const base = '2026-08-26T00:00:00.000Z';
  // Collapse: five intervals of drift still lands on a boundary of the original
  // timeline, and strictly in the future.
  const collapsed = nextBoundary(base, 60_000, Date.parse('2026-08-26T00:04:30.000Z'), { catchup: false });
  assert.equal(collapsed, '2026-08-26T00:05:00.000Z');
  assert.equal(nextBoundary(base, 60_000, Date.parse(base), { catchup: false }), '2026-08-26T00:01:00.000Z');
  // Catch-up owes the very next boundary regardless of how late the tick is.
  assert.equal(nextBoundary(base, 60_000, Date.parse('2026-08-27T00:00:00.000Z'), { catchup: true }), '2026-08-26T00:01:00.000Z');
});

test('scheduler acceptance recomputes cleanly from rows', () => {
  const { db, cleanup } = armed();
  try {
    addDue(db, { name: 'accept.sync' });
    tickScheduler(db);
    const acceptance = schedulerAcceptance(db);
    assert.deepEqual(acceptance.problems, []);
    assert.equal(acceptance.ok, true);
    assert.equal(acceptance.fires, 1);
    assert.equal(scheduleReport(db).schedules.length, 1);
  } finally {
    cleanup();
  }
});
