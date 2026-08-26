------------------------------------------------------------------------------
-- 0014 scheduler daemon
--
-- 0013 proved that a *single* tick cannot serve one boundary twice. This
-- migration adds the evidence table for the next claim up: a long-running
-- daemon that is killed and restarted repeatedly, over many boundaries, still
-- serves each boundary exactly once. That is the shape of the real thing —
-- YENO is meant to keep ticking across crashes and restarts without a human
-- pressing anything — so the evidence for it is durable and append-only like
-- every other soak record.
--
-- Additive only: no existing table is touched.
------------------------------------------------------------------------------

CREATE TABLE daemon_soak_cycles (
  cycle_id            TEXT PRIMARY KEY,
  soak_ref            TEXT NOT NULL,
  cycle               INTEGER NOT NULL CHECK (cycle >= 1),
  -- how the daemon died this cycle: a random SIGKILL mid-flight, or a clean
  -- stop at the end of the soak
  death               TEXT NOT NULL CHECK (death IN ('sigkill', 'clean')),
  killed              INTEGER NOT NULL CHECK (killed IN (0, 1)),
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

CREATE TRIGGER trg_daemon_soak_append_only
BEFORE UPDATE ON daemon_soak_cycles
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: daemon soak evidence is append-only');
END;

CREATE TRIGGER trg_daemon_soak_no_delete
BEFORE DELETE ON daemon_soak_cycles
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: daemon soak evidence cannot be deleted');
END;

-- A cycle may only call itself a pass if the daemon really died the way it
-- claims, no boundary was served twice, no job served two boundaries, and the
-- served count never went backwards. A soak that cannot fail cannot be evidence.
CREATE TRIGGER trg_daemon_soak_honest_verdict
BEFORE INSERT ON daemon_soak_cycles
WHEN NEW.ok = 1
 AND (
   (NEW.death = 'sigkill' AND NEW.killed = 0)
   OR NEW.duplicate_boundaries <> 0
   OR NEW.duplicate_jobs <> 0
   OR NEW.fires_regressed <> 0
 )
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: a daemon soak cycle passes only on a real death with no duplicated boundary');
END;

CREATE INDEX idx_daemon_soak_ref ON daemon_soak_cycles (soak_ref, cycle);
