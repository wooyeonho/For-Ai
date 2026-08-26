-- YENO Living OS — 0003_continuity.sql
-- Session continuity: a session is a RUN/checkpoint unit, never a scope cut.
-- The kernel refuses to checkpoint a session without a queued NEXT_RUN, so the
-- next session resumes from the ledger instead of re-planning.

PRAGMA foreign_keys = ON;

CREATE TABLE session_runs (
  run_ref      TEXT PRIMARY KEY,
  gate_id      TEXT NOT NULL REFERENCES gates(gate_id),
  goal         TEXT NOT NULL,
  session_ref  TEXT,
  baseline_ref TEXT NOT NULL,
  authority    TEXT NOT NULL CHECK (authority IN ('A0','A1','A2','A3','A4','A5','A6')),
  started_at   TEXT NOT NULL,
  ended_at     TEXT,
  state        TEXT NOT NULL CHECK (state IN ('IN_PROGRESS','CHECKPOINTED','CLOSED_PASS','CLOSED_FAIL')),
  report       TEXT,
  evidence_ref TEXT
) STRICT;

CREATE INDEX idx_session_runs_state ON session_runs (state, started_at);

-- Externally blocked work waits here instead of shrinking the mission. Only
-- these items may be WAITING; unblocked implementation continues regardless.
CREATE TABLE blockers (
  blocker_id  TEXT PRIMARY KEY,
  gate_id     TEXT REFERENCES gates(gate_id),
  kind        TEXT NOT NULL CHECK (kind IN (
                'OWNER_APPROVAL','CREDENTIAL','SOURCE','BUDGET','HARDWARE',
                'EXTERNAL_SERVICE','LEGAL','PROVIDER_ACCESS')),
  needed_from TEXT NOT NULL CHECK (needed_from IN ('OWNER','THIRD_PARTY','SYSTEM')),
  title       TEXT NOT NULL,
  detail      TEXT NOT NULL,
  workaround  TEXT,
  state       TEXT NOT NULL CHECK (state IN ('WAITING','RESOLVED','ABANDONED')),
  created_at  TEXT NOT NULL,
  settled_at  TEXT,
  resolution  TEXT
) STRICT;

CREATE INDEX idx_blockers_state ON blockers (state, created_at);

-- The handoff queue. Append-only in practice: an entry is consumed exactly once
-- by the session that picks it up.
CREATE TABLE next_run (
  next_id      TEXT PRIMARY KEY,
  gate_id      TEXT NOT NULL REFERENCES gates(gate_id),
  exact_action TEXT NOT NULL,
  rationale    TEXT NOT NULL,
  priority     INTEGER NOT NULL DEFAULT 0 CHECK (priority BETWEEN -40 AND 100),
  blocked_by   TEXT REFERENCES blockers(blocker_id),
  created_at   TEXT NOT NULL,
  created_by   TEXT NOT NULL,
  consumed_at  TEXT,
  consumed_by  TEXT REFERENCES session_runs(run_ref)
) STRICT;

CREATE INDEX idx_next_run_pending ON next_run (consumed_at, priority DESC, created_at);

-- A session cannot leave without evidence.
CREATE TRIGGER trg_session_close_needs_evidence
BEFORE UPDATE ON session_runs
WHEN NEW.state = 'CLOSED_PASS' AND (NEW.evidence_ref IS NULL OR NEW.evidence_ref = '')
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: CLOSED_PASS session requires evidence_ref');
END;

-- A session cannot leave without a report and a queued, unblocked next action.
CREATE TRIGGER trg_session_checkpoint_needs_next_run
BEFORE UPDATE ON session_runs
WHEN NEW.state IN ('CHECKPOINTED','CLOSED_PASS')
 AND OLD.state = 'IN_PROGRESS'
 AND (
   (NEW.report IS NULL OR NEW.report = '')
   OR NOT EXISTS (
     SELECT 1 FROM next_run
     WHERE consumed_at IS NULL
       AND (blocked_by IS NULL OR blocked_by IN (SELECT blocker_id FROM blockers WHERE state <> 'WAITING'))
   )
 )
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: checkpoint requires a report and an unblocked NEXT_RUN entry');
END;

-- A queue entry is consumed exactly once.
CREATE TRIGGER trg_next_run_single_consume
BEFORE UPDATE ON next_run
WHEN OLD.consumed_at IS NOT NULL AND NEW.consumed_at IS NOT NULL AND NEW.consumed_at <> OLD.consumed_at
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: next_run entry already consumed');
END;

-- Settling a blocker requires stating how it was settled.
CREATE TRIGGER trg_blocker_settle_needs_resolution
BEFORE UPDATE ON blockers
WHEN NEW.state IN ('RESOLVED','ABANDONED') AND (NEW.resolution IS NULL OR NEW.resolution = '')
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: settling a blocker requires a resolution');
END;

-- Queue entries are never deleted; the ledger keeps abandoned intent visible.
CREATE TRIGGER trg_next_run_no_delete
BEFORE DELETE ON next_run
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: next_run is append-only');
END;

CREATE VIEW v_handoff AS
SELECT
  (SELECT current_gate FROM release_state WHERE id = 1)                              AS current_gate,
  (SELECT COUNT(*) FROM gates WHERE state = 'PASSED')                                AS gates_passed,
  (SELECT run_ref FROM session_runs ORDER BY started_at DESC LIMIT 1)                AS last_run_ref,
  (SELECT state FROM session_runs ORDER BY started_at DESC LIMIT 1)                  AS last_run_state,
  (SELECT COUNT(*) FROM session_runs WHERE state = 'IN_PROGRESS')                    AS runs_in_progress,
  (SELECT COUNT(*) FROM blockers WHERE state = 'WAITING')                            AS blockers_waiting,
  (SELECT COUNT(*) FROM next_run WHERE consumed_at IS NULL)                          AS next_run_pending,
  (SELECT exact_action FROM next_run WHERE consumed_at IS NULL
     ORDER BY priority DESC, created_at LIMIT 1)                                     AS next_exact_action;
