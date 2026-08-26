-- YENO Living OS — 0006_durability.sql
-- G1 Durable Truth needs evidence that the kernel survives time and violence,
-- not a single green test run. A soak session is a bounded, repeated cycle of
-- append -> SIGKILL -> restart -> replay -> verify -> backup -> restore, and
-- every cycle records its own probe rows here. The gate can only read PASSED
-- from probe rows it did not write itself.

PRAGMA foreign_keys = ON;

CREATE TABLE soak_sessions (
  soak_id          TEXT PRIMARY KEY,
  gate_id          TEXT NOT NULL REFERENCES gates(gate_id),
  run_ref          TEXT REFERENCES session_runs(run_ref),
  host             TEXT NOT NULL,
  node_version     TEXT NOT NULL,
  planned_cycles   INTEGER NOT NULL CHECK (planned_cycles > 0),
  completed_cycles INTEGER NOT NULL DEFAULT 0 CHECK (completed_cycles >= 0),
  kill_count       INTEGER NOT NULL DEFAULT 0 CHECK (kill_count >= 0),
  restore_count    INTEGER NOT NULL DEFAULT 0 CHECK (restore_count >= 0),
  events_appended  INTEGER NOT NULL DEFAULT 0 CHECK (events_appended >= 0),
  started_at       TEXT NOT NULL,
  ended_at         TEXT,
  duration_ms      INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  state            TEXT NOT NULL CHECK (state IN ('RUNNING','PASSED','FAILED','ABORTED')),
  head_hash        TEXT,
  evidence_ref     TEXT,
  failure          TEXT
) STRICT;

CREATE INDEX idx_soak_sessions_state ON soak_sessions (gate_id, state, started_at);

-- One row per verification performed inside a cycle. Probes are the atoms of
-- G1 evidence: append-only, and a failing probe is kept, never overwritten.
CREATE TABLE durability_probes (
  probe_id    TEXT PRIMARY KEY,
  soak_id     TEXT NOT NULL REFERENCES soak_sessions(soak_id),
  cycle       INTEGER NOT NULL CHECK (cycle >= 1),
  kind        TEXT NOT NULL CHECK (kind IN (
                'CRASH_REPLAY','CHAIN_VERIFY','PROJECTION_DETERMINISM',
                'INTEGRITY','BACKUP_RESTORE','LEASE_FENCING')),
  ok          INTEGER NOT NULL CHECK (ok IN (0,1)),
  detail      TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
  UNIQUE (soak_id, cycle, kind)
) STRICT;

CREATE INDEX idx_durability_probes_soak ON durability_probes (soak_id, cycle);

CREATE TRIGGER trg_probe_no_delete
BEFORE DELETE ON durability_probes
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: durability probes are append-only evidence');
END;

CREATE TRIGGER trg_probe_no_result_rewrite
BEFORE UPDATE OF ok, detail, cycle, kind ON durability_probes
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: a recorded probe result cannot be rewritten');
END;

-- A soak session may not declare itself durable while a probe failed, while it
-- ran fewer cycles than it planned, while nothing was ever SIGKILLed, or while
-- any required probe kind was never exercised.
CREATE TRIGGER trg_soak_pass_needs_evidence
BEFORE UPDATE ON soak_sessions
WHEN NEW.state = 'PASSED'
 AND (
   EXISTS (SELECT 1 FROM durability_probes WHERE soak_id = NEW.soak_id AND ok = 0)
   OR NEW.completed_cycles < NEW.planned_cycles
   OR NEW.kill_count = 0
   OR NEW.restore_count = 0
   OR (SELECT COUNT(DISTINCT kind) FROM durability_probes
        WHERE soak_id = NEW.soak_id
          AND kind IN ('CRASH_REPLAY','CHAIN_VERIFY','PROJECTION_DETERMINISM',
                       'INTEGRITY','BACKUP_RESTORE','LEASE_FENCING')) < 6
   OR NEW.evidence_ref IS NULL
 )
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: a soak session cannot pass without complete crash/restore probe evidence');
END;

-- Reading soak state must not require knowing the probe schema.
CREATE VIEW v_durability AS
SELECT
  s.soak_id,
  s.gate_id,
  s.state,
  s.planned_cycles,
  s.completed_cycles,
  s.kill_count,
  s.restore_count,
  s.events_appended,
  s.duration_ms,
  s.head_hash,
  s.evidence_ref,
  s.failure,
  (SELECT COUNT(*) FROM durability_probes p WHERE p.soak_id = s.soak_id) AS probes,
  (SELECT COUNT(*) FROM durability_probes p WHERE p.soak_id = s.soak_id AND p.ok = 0) AS probes_failed,
  (SELECT COUNT(DISTINCT p.kind) FROM durability_probes p WHERE p.soak_id = s.soak_id) AS probe_kinds
FROM soak_sessions s;

-- G1 stays honest until a soak session actually passes on this machine.
UPDATE gates
   SET blocked_reason = 'NEEDS_SOAK: durability probes exist per-commit, but no long-run soak session (crash + restore cycles) has passed yet'
 WHERE gate_id = 'G1' AND state <> 'PASSED';
