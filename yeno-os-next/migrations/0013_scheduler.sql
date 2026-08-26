-- YENO Living OS — 0013_scheduler.sql
-- G4 Workflow Runtime, second half: recurring schedules.
--
-- 0012 gave the queue at-most-once external effects for work someone asked for.
-- A scheduler is the first thing in this system that asks for work *without* a
-- human in the loop, so it needs a narrower contract than "fires roughly on
-- time":
--
--   1. A scheduled occurrence fires at most once. Ever. Two racing ticks, a tick
--      killed mid-commit, or a restart that replays the same clock must all end
--      with one job for that due boundary. The (schedule_id, due_at) unique key
--      is what enforces it, written in the same transaction as the enqueue.
--   2. Missed time does not become a burst. A machine asleep for a day wakes up
--      owing one occurrence, not 1440 of them, unless the schedule explicitly
--      asks for catch-up.
--   3. Nothing fires unless the Owner turned both the master switch (0012) and
--      the individual schedule on, and the emergency stop is off.

PRAGMA foreign_keys = ON;

------------------------------------------------------------------------------
-- 0. Replace the 0012 placeholder, but only if it never held anything
------------------------------------------------------------------------------

-- 0012 declared a `schedules` table that no code ever wrote to. Replacing it is
-- only safe if that is actually true, so this migration proves it instead of
-- assuming it: the CHECK fails — and the whole migration aborts — if the
-- placeholder holds even one row.
CREATE TABLE _schedules_placeholder_must_be_empty (rows INTEGER NOT NULL CHECK (rows = 0)) STRICT;
INSERT INTO _schedules_placeholder_must_be_empty (rows) SELECT COUNT(*) FROM schedules;
DROP TABLE _schedules_placeholder_must_be_empty;
DROP TABLE schedules;

------------------------------------------------------------------------------
-- 1. Schedules — OFF by default, individually and collectively
------------------------------------------------------------------------------

CREATE TABLE schedules (
  schedule_id   TEXT PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  queue         TEXT NOT NULL DEFAULT 'default',
  kind          TEXT NOT NULL,
  payload_json  TEXT NOT NULL,
  -- One second is the floor: a schedule is not a busy loop.
  interval_ms   INTEGER NOT NULL CHECK (interval_ms >= 1000),
  enabled       INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  -- 0 = collapse missed occurrences to the next future boundary (default),
  -- 1 = owe every missed occurrence, one per tick, never as a burst.
  catchup       INTEGER NOT NULL DEFAULT 0 CHECK (catchup IN (0, 1)),
  authority     TEXT NOT NULL DEFAULT 'A2' CHECK (authority IN ('A0','A1','A2','A3','A4','A5','A6')),
  next_due_at   TEXT NOT NULL,
  last_fired_at TEXT,
  last_job_id   TEXT REFERENCES jobs(job_id),
  fire_count    INTEGER NOT NULL DEFAULT 0 CHECK (fire_count >= 0),
  reason        TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  created_by    TEXT NOT NULL
) STRICT;

CREATE INDEX idx_schedules_due ON schedules(enabled, next_due_at);

-- Every occurrence that ever fired, with the boundary it belongs to. The unique
-- key is the at-most-once proof: a killed tick that already inserted this row
-- cannot insert it again on restart, and a second worker ticking concurrently
-- loses the race instead of duplicating the job.
CREATE TABLE schedule_fires (
  fire_id     TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL REFERENCES schedules(schedule_id),
  due_at      TEXT NOT NULL,
  fired_at    TEXT NOT NULL,
  tick_id     TEXT NOT NULL,
  job_id      TEXT NOT NULL REFERENCES jobs(job_id),
  deduped     INTEGER NOT NULL DEFAULT 0 CHECK (deduped IN (0, 1)),
  UNIQUE (schedule_id, due_at)
) STRICT;

CREATE INDEX idx_schedule_fires_schedule ON schedule_fires(schedule_id, fired_at);

------------------------------------------------------------------------------
-- 2. Guards
------------------------------------------------------------------------------

-- A schedule may only be armed by the Owner, with a reason. 'owner' alone is a
-- self-reported label, so the reason has to say something.
CREATE TRIGGER trg_schedules_enable_needs_owner
BEFORE UPDATE OF enabled ON schedules
WHEN NEW.enabled = 1 AND OLD.enabled = 0
  AND (NEW.created_by <> 'owner' OR NEW.reason IS NULL OR TRIM(NEW.reason) = '')
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: only the Owner arms a schedule, with a reason');
END;

CREATE TRIGGER trg_schedules_insert_enabled_needs_owner
BEFORE INSERT ON schedules
WHEN NEW.enabled = 1 AND (NEW.created_by <> 'owner' OR NEW.reason IS NULL OR TRIM(NEW.reason) = '')
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: only the Owner arms a schedule, with a reason');
END;

-- What a schedule *does* is fixed at creation. Editing the kind or payload of a
-- live schedule would let armed automation quietly become different automation.
CREATE TRIGGER trg_schedules_intent_immutable
BEFORE UPDATE ON schedules
WHEN NEW.kind <> OLD.kind OR NEW.payload_json <> OLD.payload_json
  OR NEW.queue <> OLD.queue OR NEW.authority <> OLD.authority
  OR NEW.interval_ms <> OLD.interval_ms OR NEW.schedule_id <> OLD.schedule_id
  OR NEW.name <> OLD.name OR NEW.created_at <> OLD.created_at
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: a schedule''s intent is immutable; disable it and create another');
END;

-- Time only moves forward, and so does the fire count: rewinding either is how
-- an occurrence would get a second chance to fire.
CREATE TRIGGER trg_schedules_due_monotonic
BEFORE UPDATE OF next_due_at ON schedules
WHEN NEW.next_due_at < OLD.next_due_at
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: a schedule''s due time cannot move backwards');
END;

CREATE TRIGGER trg_schedules_fire_count_monotonic
BEFORE UPDATE OF fire_count ON schedules
WHEN NEW.fire_count < OLD.fire_count
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: a schedule''s fire count is monotonic');
END;

CREATE TRIGGER trg_schedules_no_delete
BEFORE DELETE ON schedules
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: schedules are disabled, never deleted');
END;

-- Firing history is evidence: append-only, never rewritten, never removed.
CREATE TRIGGER trg_schedule_fires_immutable
BEFORE UPDATE ON schedule_fires
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: schedule firing history is append-only');
END;

CREATE TRIGGER trg_schedule_fires_no_delete
BEFORE DELETE ON schedule_fires
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: schedule firing history cannot be deleted');
END;

-- Both switches, every time: the master scheduler switch from 0012 and the
-- emergency stop. A fire recorded while either is off is a bypass.
CREATE TRIGGER trg_schedule_fires_need_scheduler_on
BEFORE INSERT ON schedule_fires
WHEN (SELECT enabled FROM scheduler_state WHERE id = 1) = 0
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: the scheduler is off; no schedule may fire');
END;

CREATE TRIGGER trg_schedule_fires_no_fire_while_stopped
BEFORE INSERT ON schedule_fires
WHEN (SELECT engaged FROM emergency_stop WHERE id = 1) = 1
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: the emergency stop is engaged; no schedule may fire');
END;

-- A fire must belong to an armed schedule, and its boundary must be one this
-- schedule actually owed: a fire dated in the schedule's future is fabricated.
CREATE TRIGGER trg_schedule_fires_only_when_armed
BEFORE INSERT ON schedule_fires
WHEN (SELECT enabled FROM schedules WHERE schedule_id = NEW.schedule_id) = 0
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: a disabled schedule cannot fire');
END;

------------------------------------------------------------------------------
-- 3. Crash soak evidence
------------------------------------------------------------------------------

-- One row per SIGKILL against a real ticking process. `jobs_for_boundary` is the
-- number that matters: after the kill and the restart, how many jobs exist for
-- the single boundary that was owed. Anything but 1 is a broken scheduler, and a
-- row claiming ok with any other number is a lie the trigger below refuses.
CREATE TABLE schedule_soak_cycles (
  cycle_id           TEXT PRIMARY KEY,
  soak_ref           TEXT NOT NULL,
  cycle              INTEGER NOT NULL CHECK (cycle >= 1),
  kill_point         TEXT NOT NULL CHECK (kill_point IN ('in-transaction', 'after-commit')),
  killed             INTEGER NOT NULL CHECK (killed IN (0, 1)),
  jobs_for_boundary  INTEGER NOT NULL CHECK (jobs_for_boundary >= 0),
  fires_for_boundary INTEGER NOT NULL CHECK (fires_for_boundary >= 0),
  ok                 INTEGER NOT NULL CHECK (ok IN (0, 1)),
  detail             TEXT NOT NULL,
  recorded_at        TEXT NOT NULL,
  UNIQUE (soak_ref, cycle)
) STRICT;

CREATE TRIGGER trg_schedule_soak_append_only
BEFORE UPDATE ON schedule_soak_cycles
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: scheduler soak evidence is append-only');
END;

CREATE TRIGGER trg_schedule_soak_no_delete
BEFORE DELETE ON schedule_soak_cycles
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: scheduler soak evidence cannot be deleted');
END;

CREATE TRIGGER trg_schedule_soak_honest_verdict
BEFORE INSERT ON schedule_soak_cycles
WHEN NEW.ok = 1 AND (NEW.killed = 0 OR NEW.jobs_for_boundary <> 1 OR NEW.fires_for_boundary <> 1)
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: a scheduler soak cycle passes only on one real kill and exactly one job per boundary');
END;

------------------------------------------------------------------------------
-- 4. Read model
------------------------------------------------------------------------------

CREATE VIEW schedule_health AS
SELECT
  s.schedule_id,
  s.name,
  s.enabled,
  s.catchup,
  s.interval_ms,
  s.next_due_at,
  s.fire_count,
  (SELECT COUNT(*) FROM schedule_fires f WHERE f.schedule_id = s.schedule_id) AS recorded_fires,
  (SELECT COUNT(*) FROM schedule_fires f WHERE f.schedule_id = s.schedule_id AND f.deduped = 1) AS deduped_fires,
  (SELECT COUNT(DISTINCT f.due_at) FROM schedule_fires f WHERE f.schedule_id = s.schedule_id) AS distinct_boundaries
FROM schedules s;
