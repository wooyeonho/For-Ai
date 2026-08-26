// G4 Workflow Runtime, second half: the durable scheduler.
//
// This is the first component that creates work with no human in the loop, so
// its contract is deliberately narrow:
//
//   * an occurrence (schedule, due boundary) is enqueued at most once, even if a
//     tick is SIGKILLed mid-commit or two ticks race;
//   * missed time collapses to one owed occurrence by default, so a machine that
//     slept does not wake up and flood the queue;
//   * a tick refuses to do anything unless the Owner armed both the master
//     switch and the schedule, and the emergency stop is off.
//
// The fire row and the enqueue live in one transaction, and (schedule_id, due_at)
// is unique, so the database — not this file — is what makes double-firing
// impossible.
import { newId, nowIso } from '../core/ids.mjs';
import { appendEvent } from '../core/events.mjs';
import { stopEngaged } from '../core/governor.mjs';
import { inTransaction } from '../core/db.mjs';
import { enqueueJob, schedulerEnabled, DEFAULT_QUEUE } from './workflow.mjs';

/**
 * The boundary an occurrence belongs to. Boundaries are anchored to the
 * schedule's own timeline (created_at + k * interval), so they are reproducible
 * from the row alone rather than from whenever a tick happened to run.
 */
export function nextBoundary(dueAt, intervalMs, now, { catchup = false } = {}) {
  const due = Date.parse(dueAt);
  if (catchup) return new Date(due + intervalMs).toISOString();
  // Collapse: skip straight past every boundary already in the past, and land
  // strictly in the future — a boundary landing exactly on `now` would be owed
  // again by the very next tick, which is how a collapse turns into a burst.
  const missed = Math.floor(Math.max(0, now - due) / intervalMs) + 1;
  return new Date(due + missed * intervalMs).toISOString();
}

export function createSchedule(
  db,
  {
    name,
    kind,
    payload = {},
    intervalMs,
    queue = DEFAULT_QUEUE,
    authority = 'A2',
    catchup = false,
    enabled = false,
    reason,
    actor = 'owner',
    firstDueAt = null,
  },
  clock = Date,
) {
  if (!name) throw new Error('YENO_SCHED: a schedule needs a name');
  if (!kind) throw new Error('YENO_SCHED: a schedule needs a job kind');
  if (!Number.isInteger(intervalMs) || intervalMs < 1000) {
    throw new Error('YENO_SCHED: interval_ms must be an integer of at least 1000');
  }
  if (!reason || !reason.trim()) throw new Error('YENO_SCHED: a schedule needs a reason');
  const at = nowIso(clock);
  const scheduleId = newId('SCH');
  const dueAt = firstDueAt ?? new Date(clock.now() + intervalMs).toISOString();
  db.prepare(
    `INSERT INTO schedules (schedule_id, name, queue, kind, payload_json, interval_ms, enabled, catchup,
       authority, next_due_at, fire_count, reason, created_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
  ).run(
    scheduleId,
    name,
    queue,
    kind,
    JSON.stringify(payload),
    intervalMs,
    enabled ? 1 : 0,
    catchup ? 1 : 0,
    authority,
    dueAt,
    reason,
    at,
    actor,
  );
  appendEvent(
    db,
    { type: 'queue.schedule_created', actor, authority: 'A0', payload: { schedule_id: scheduleId, name, kind, interval_ms: intervalMs, enabled: Boolean(enabled), reason } },
    clock,
  );
  return db.prepare('SELECT * FROM schedules WHERE schedule_id = ?').get(scheduleId);
}

/** Arming and disarming are Owner acts, and both are recorded with a reason. */
export function setScheduleEnabled(db, name, enabled, reason, actor = 'owner', clock = Date) {
  if (!reason || !reason.trim()) throw new Error('YENO_SCHED: arming or disarming needs a reason');
  const row = db.prepare('SELECT * FROM schedules WHERE name = ?').get(name);
  if (!row) throw new Error(`YENO_SCHED: unknown schedule ${name}`);
  db.prepare('UPDATE schedules SET enabled = ?, reason = ?, created_by = ? WHERE schedule_id = ?').run(
    enabled ? 1 : 0,
    reason,
    actor,
    row.schedule_id,
  );
  appendEvent(
    db,
    { type: enabled ? 'queue.schedule_armed' : 'queue.schedule_disarmed', actor, authority: 'A0', payload: { schedule_id: row.schedule_id, name, reason } },
    clock,
  );
  return db.prepare('SELECT * FROM schedules WHERE schedule_id = ?').get(row.schedule_id);
}

export function dueSchedules(db, clock = Date) {
  return db
    .prepare("SELECT * FROM schedules WHERE enabled = 1 AND next_due_at <= ? ORDER BY next_due_at")
    .all(nowIso(clock));
}

/**
 * One tick. Returns what fired and why nothing fired when nothing did — a tick
 * that refuses is a normal, reportable outcome, not an error.
 */
export function tickScheduler(db, { tickId = newId('TICK'), limit = 50, beforeCommit = null } = {}, clock = Date) {
  if (stopEngaged(db)) {
    return { tick_id: tickId, refused: 'EMERGENCY_STOP', fired: [] };
  }
  if (!schedulerEnabled(db)) {
    return { tick_id: tickId, refused: 'SCHEDULER_OFF', fired: [] };
  }
  const fired = [];
  for (const schedule of dueSchedules(db, clock).slice(0, limit)) {
    const dueAt = schedule.next_due_at;
    const at = nowIso(clock);
    // The fire row and the job are one atomic fact. A kill before the commit
    // leaves neither, and a kill after it leaves both — never a job without the
    // record that would stop it happening twice.
    try {
      const outcome = inTransaction(db, () => {
        const job = enqueueJob(
          db,
          {
            queue: schedule.queue,
            kind: schedule.kind,
            payload: { ...JSON.parse(schedule.payload_json), scheduled_for: dueAt, schedule: schedule.name },
            // The boundary is part of the identity, so a replayed tick dedupes
            // onto the same job instead of creating a second one.
            dedupeKey: `sched:${schedule.name}@${dueAt}`,
            authority: schedule.authority,
          },
          clock,
        );
        db.prepare(
          `INSERT INTO schedule_fires (fire_id, schedule_id, due_at, fired_at, tick_id, job_id, deduped)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(newId('SFR'), schedule.schedule_id, dueAt, at, tickId, job.job_id, job.deduped ? 1 : 0);
        db.prepare(
          `UPDATE schedules SET next_due_at = ?, last_fired_at = ?, last_job_id = ?, fire_count = fire_count + 1
             WHERE schedule_id = ?`,
        ).run(
          nextBoundary(dueAt, schedule.interval_ms, clock.now(), { catchup: schedule.catchup === 1 }),
          at,
          job.job_id,
          schedule.schedule_id,
        );
        // A seam the crash soak uses to die with the transaction still open. It
        // has no production caller: the point is to prove that a process killed
        // here leaves neither the job nor the fire row behind.
        if (beforeCommit) beforeCommit({ schedule: schedule.name, due_at: dueAt, job_id: job.job_id });
        return { schedule: schedule.name, due_at: dueAt, job_id: job.job_id, deduped: Boolean(job.deduped) };
      });
      appendEvent(
        db,
        { type: 'queue.schedule_fired', actor: 'runtime', authority: schedule.authority, payload: { schedule_id: schedule.schedule_id, ...outcome, tick_id: tickId } },
        clock,
      );
      fired.push(outcome);
    } catch (err) {
      // A lost race on (schedule_id, due_at) is the guarantee working, not a
      // failure: some other tick already owns this occurrence.
      if (/UNIQUE constraint failed: schedule_fires/.test(String(err))) {
        fired.push({ schedule: schedule.name, due_at: dueAt, job_id: null, already_fired: true });
        continue;
      }
      throw err;
    }
  }
  return { tick_id: tickId, refused: null, fired };
}

/**
 * The daemon loop: tick, sleep, tick again, for as long as it is allowed to.
 *
 * It never arms anything and never releases the stop — it only serves boundaries
 * the Owner already armed, so the worst a runaway daemon can do is tick a
 * disarmed scheduler and refuse itself. `onOutcome` is how a supervisor watches
 * it; `shouldStop` is how a test or a signal handler ends it deterministically.
 */
export async function runSchedulerDaemon(
  db,
  { tickMs = 250, maxTicks = Infinity, onOutcome = null, shouldStop = null, sleep = null } = {},
  clock = Date,
) {
  const pause = sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  let ticks = 0;
  let served = 0;
  while (ticks < maxTicks && !(shouldStop && shouldStop())) {
    const outcome = tickScheduler(db, {}, clock);
    ticks += 1;
    served += outcome.fired.filter((f) => !f.already_fired && !f.deduped).length;
    if (onOutcome) onOutcome(outcome);
    if (shouldStop && shouldStop()) break;
    await pause(tickMs);
  }
  return { ticks, served };
}

export function scheduleReport(db) {
  return {
    generated_at: new Date().toISOString(),
    scheduler_enabled: schedulerEnabled(db),
    stop_engaged: stopEngaged(db),
    schedules: db.prepare('SELECT * FROM schedule_health ORDER BY name').all(),
    recent_fires: db
      .prepare('SELECT schedule_id, due_at, fired_at, job_id, deduped FROM schedule_fires ORDER BY fired_at DESC LIMIT 20')
      .all(),
  };
}

/**
 * Acceptance recomputed from rows: every schedule fired each boundary once, no
 * fire exists without its job, and no armed schedule fired while a switch was
 * off (that last one is only checkable historically, via the event ledger).
 */
export function schedulerAcceptance(db) {
  const problems = [];
  const dupBoundaries = db
    .prepare('SELECT schedule_id, due_at, COUNT(*) AS n FROM schedule_fires GROUP BY schedule_id, due_at HAVING n > 1')
    .all();
  for (const d of dupBoundaries) problems.push(`schedule ${d.schedule_id} fired boundary ${d.due_at} ${d.n} times`);

  const orphanFires = db
    .prepare('SELECT COUNT(*) AS n FROM schedule_fires f LEFT JOIN jobs j ON j.job_id = f.job_id WHERE j.job_id IS NULL')
    .get().n;
  if (orphanFires > 0) problems.push(`${orphanFires} schedule fire(s) reference a job that does not exist`);

  const duplicateJobs = db
    .prepare('SELECT COUNT(*) AS n FROM (SELECT job_id FROM schedule_fires GROUP BY job_id HAVING COUNT(DISTINCT due_at) > 1)')
    .get().n;
  if (duplicateJobs > 0) problems.push(`${duplicateJobs} job(s) claim to serve more than one boundary`);

  const rewound = db
    .prepare('SELECT COUNT(*) AS n FROM schedules s WHERE s.fire_count < (SELECT COUNT(*) FROM schedule_fires f WHERE f.schedule_id = s.schedule_id)')
    .get().n;
  if (rewound > 0) problems.push(`${rewound} schedule(s) report fewer fires than the history records`);

  return {
    generated_at: new Date().toISOString(),
    schedules: db.prepare('SELECT COUNT(*) AS n FROM schedules').get().n,
    armed: db.prepare('SELECT COUNT(*) AS n FROM schedules WHERE enabled = 1').get().n,
    fires: db.prepare('SELECT COUNT(*) AS n FROM schedule_fires').get().n,
    deduped_fires: db.prepare('SELECT COUNT(*) AS n FROM schedule_fires WHERE deduped = 1').get().n,
    problems,
    ok: problems.length === 0,
  };
}
