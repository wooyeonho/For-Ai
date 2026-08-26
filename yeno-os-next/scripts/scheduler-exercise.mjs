#!/usr/bin/env node
// One real pass of the scheduler through the kernel ledger, so the scheduler
// half of G4 rests on work this OS actually did: a schedule created disarmed, an
// Owner arming it with a reason, one owed boundary firing exactly once, a
// replayed tick refusing to fire it again, missed time collapsing instead of
// bursting, and both switches returned to their safe position at the end.
//
//   node scripts/scheduler-exercise.mjs [--db state/yeno.db]
import { openDb, DEFAULT_DB_PATH } from '../src/core/db.mjs';
import { migrate, MIGRATIONS_DIR } from '../src/core/migrate.mjs';
import { stopEngaged, setStop } from '../src/core/governor.mjs';
import { setScheduler, schedulerEnabled } from '../src/domain/workflow.mjs';
import {
  createSchedule,
  setScheduleEnabled,
  tickScheduler,
  scheduleReport,
  schedulerAcceptance,
} from '../src/domain/scheduler.mjs';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1]);
const dbPath = args.get('db') ?? DEFAULT_DB_PATH;
const reason = args.get('reason') ?? 'G4 scheduler exercise: prove at-most-once firing on the real kernel';
const name = args.get('name') ?? `g4.exercise.${Date.now()}`;

const db = openDb(dbPath);
migrate(db, MIGRATIONS_DIR);

const report = { started_at: new Date().toISOString(), db: dbPath, schedule: name, steps: [] };
// Whatever the kernel was set to, it goes back to that afterwards: an exercise
// must not leave the scheduler running or the stop released.
const stopWasEngaged = stopEngaged(db);
const schedulerWasEnabled = schedulerEnabled(db);

try {
  if (stopWasEngaged) setStop(db, false, `${reason} (released for the exercise only)`, 'owner');

  // 1. A schedule is born disarmed, and a tick with the master switch still off
  //    refuses outright — two independent switches, both fail-closed.
  const schedule = createSchedule(db, {
    name,
    kind: 'scheduler.exercise',
    payload: { note: 'a local no-op job, enqueued to prove the boundary fired once' },
    intervalMs: 60_000,
    reason,
    firstDueAt: new Date(Date.now() - 1_000).toISOString(),
  });
  const offTick = tickScheduler(db);
  report.steps.push({
    step: 'both_switches_off',
    schedule_id: schedule.schedule_id,
    born_enabled: schedule.enabled,
    tick_refused_with: offTick.refused ?? 'NOT_REFUSED',
  });
  if (schedule.enabled !== 0 || offTick.refused !== 'SCHEDULER_OFF') {
    throw new Error('YENO_G4: a schedule fired with the master switch off');
  }

  // 2. Master switch on, schedule still disarmed: still nothing fires.
  setScheduler(db, true, reason, 'owner');
  const disarmedTick = tickScheduler(db);
  report.steps.push({ step: 'schedule_still_disarmed', fired: disarmedTick.fired.length });
  if (disarmedTick.fired.length !== 0) throw new Error('YENO_G4: a disarmed schedule fired');

  // 3. Armed by the Owner with a reason. One owed boundary, one job.
  setScheduleEnabled(db, name, true, reason, 'owner');
  const first = tickScheduler(db);
  const firedOnce = first.fired.filter((f) => f.schedule === name);
  report.steps.push({ step: 'first_boundary', fired: firedOnce });
  if (firedOnce.length !== 1) throw new Error('YENO_G4: an owed boundary did not produce exactly one job');

  // 4. A replayed tick — the same tick id, as a retried caller would send — must
  //    not serve the boundary a second time.
  const replay = tickScheduler(db, { tickId: first.tick_id });
  const fires = db
    .prepare('SELECT COUNT(*) AS n FROM schedule_fires WHERE schedule_id = ? AND due_at = ?')
    .get(schedule.schedule_id, firedOnce[0].due_at).n;
  report.steps.push({ step: 'replayed_tick', fired: replay.fired.length, fires_for_boundary: fires });
  if (replay.fired.length !== 0 || fires !== 1) throw new Error('YENO_G4: a replayed tick fired the same boundary twice');

  // 5. Missed time: the schedule is owed many hours of boundaries, and the
  //    collapse must hand out one, not a burst.
  const row = db.prepare('SELECT * FROM schedules WHERE schedule_id = ?').get(schedule.schedule_id);
  const before = db.prepare('SELECT COUNT(*) AS n FROM schedule_fires WHERE schedule_id = ?').get(schedule.schedule_id).n;
  const collapsed = tickScheduler(db, {}, { now: () => Date.parse(row.next_due_at) + 6 * 60 * 60 * 1000 });
  const after = db.prepare('SELECT COUNT(*) AS n FROM schedule_fires WHERE schedule_id = ?').get(schedule.schedule_id).n;
  report.steps.push({
    step: 'missed_time_collapses',
    owed_hours: 6,
    fires_added: after - before,
    fired: collapsed.fired.length,
  });
  if (after - before !== 1) throw new Error('YENO_G4: missed time turned into a burst');

  report.schedule_report = scheduleReport(db);
  report.acceptance = schedulerAcceptance(db);
} finally {
  // 6. Back to safe: the schedule is disarmed, the scheduler switch and the stop
  //    return to whatever they were before the exercise touched them.
  try {
    setScheduleEnabled(db, name, false, 'exercise finished', 'owner');
  } catch {
    // The schedule may not exist if the exercise failed before creating it.
  }
  if (!schedulerWasEnabled) setScheduler(db, false, 'exercise finished; the scheduler goes back off', 'owner');
  if (stopWasEngaged) setStop(db, true, 'exercise finished; the stop goes back on', 'owner');
  report.left_behind = { scheduler_enabled: schedulerEnabled(db), stop_engaged: stopEngaged(db) };
  report.finished_at = new Date().toISOString();
  db.close();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

const problems = report.acceptance?.problems ?? ['the exercise did not reach acceptance'];
process.stdout.write(problems.length === 0 ? 'SCHEDULER_EXERCISE_PASS\n' : 'SCHEDULER_EXERCISE_INCOMPLETE\n');
process.exit(problems.length === 0 ? 0 : 1);
