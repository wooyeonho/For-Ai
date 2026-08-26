------------------------------------------------------------------------------
-- 0015 scheduler supervisor
--
-- 0014 proved a daemon that is killed and restarted by hand keeps its
-- at-most-once guarantee. Nothing restarted it, though: a human ran the next
-- process. This migration adds the evidence table for the layer that makes the
-- OS survive on its own — a supervisor that notices its daemon died, waits a
-- backoff, starts a new one, and refuses to spin forever when the daemon is
-- broken rather than merely unlucky.
--
-- What the evidence has to show is narrow and checkable: the supervisor
-- actually replaced the process (a different pid), the boundary work still went
-- forward, and no boundary was served twice across every death. A supervisor
-- that "restarted" without a new pid, or that a cycle claims restarted zero
-- times, is a lie the table refuses to hold.
--
-- Additive only: no existing table is touched.
------------------------------------------------------------------------------

CREATE TABLE supervisor_soak_cycles (
  cycle_id            TEXT PRIMARY KEY,
  soak_ref            TEXT NOT NULL,
  cycle               INTEGER NOT NULL CHECK (cycle >= 1),
  -- what died this cycle: the daemon child (the supervisor should replace it),
  -- or the supervisor itself (nothing local can replace that — the next boot
  -- has to), or a clean shutdown at the end of the soak
  death               TEXT NOT NULL CHECK (death IN ('child', 'supervisor', 'clean')),
  killed              INTEGER NOT NULL CHECK (killed IN (0, 1)),
  -- how many times the supervisor started a fresh daemon during this cycle
  restarts            INTEGER NOT NULL CHECK (restarts >= 0),
  -- distinct daemon pids observed: a restart that reuses the same process is
  -- not a restart
  distinct_child_pids INTEGER NOT NULL CHECK (distinct_child_pids >= 0),
  ran_ms              INTEGER NOT NULL CHECK (ran_ms >= 0),
  boundaries_served   INTEGER NOT NULL CHECK (boundaries_served >= 0),
  duplicate_boundaries INTEGER NOT NULL CHECK (duplicate_boundaries >= 0),
  duplicate_jobs      INTEGER NOT NULL CHECK (duplicate_jobs >= 0),
  fires_regressed     INTEGER NOT NULL CHECK (fires_regressed IN (0, 1)),
  ok                  INTEGER NOT NULL CHECK (ok IN (0, 1)),
  detail              TEXT NOT NULL,
  recorded_at         TEXT NOT NULL,
  UNIQUE (soak_ref, cycle)
) STRICT;

CREATE INDEX idx_supervisor_soak_ref ON supervisor_soak_cycles (soak_ref, cycle);

CREATE TRIGGER trg_supervisor_soak_append_only
BEFORE UPDATE ON supervisor_soak_cycles
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: supervisor soak evidence is append-only');
END;

CREATE TRIGGER trg_supervisor_soak_no_delete
BEFORE DELETE ON supervisor_soak_cycles
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: supervisor soak evidence cannot be deleted');
END;

-- A cycle may only be recorded as a pass if the death it claims really
-- happened, a child death was really answered with a *new* process, and the
-- boundary work stayed exactly-once.
CREATE TRIGGER trg_supervisor_soak_honest_verdict
BEFORE INSERT ON supervisor_soak_cycles
WHEN NEW.ok = 1
 AND (
   (NEW.death <> 'clean' AND NEW.killed = 0)
   OR (NEW.death = 'child' AND (NEW.restarts < 1 OR NEW.distinct_child_pids < 2))
   OR NEW.duplicate_boundaries <> 0
   OR NEW.duplicate_jobs <> 0
   OR NEW.fires_regressed <> 0
 )
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: a supervisor soak cycle passes only on a real death answered by a real new process with no duplicated boundary');
END;
