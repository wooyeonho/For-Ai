-- YENO Living OS — 0002_release_control.sql
-- Release train state, gates, work orders, projection metadata, backup records.

PRAGMA foreign_keys = ON;

CREATE TABLE release_state (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  version       TEXT NOT NULL,
  current_gate  TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  evidence_ref  TEXT
) STRICT;

INSERT INTO release_state (id, version, current_gate, updated_at, evidence_ref)
VALUES (1, '0.0.1', 'G0', '2026-08-26T00:00:00Z', NULL);

CREATE TABLE gates (
  gate_id      TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  ordinal      INTEGER NOT NULL UNIQUE,
  state        TEXT NOT NULL CHECK (state IN ('PENDING','IN_PROGRESS','PASSED','BLOCKED','INCOMPLETE')),
  evidence_ref TEXT,
  blocked_reason TEXT,
  updated_at   TEXT NOT NULL
) STRICT;

INSERT INTO gates (gate_id, name, ordinal, state, evidence_ref, blocked_reason, updated_at) VALUES
  ('G0','Baseline Lock',0,'IN_PROGRESS',NULL,NULL,'2026-08-26T00:00:00Z'),
  ('G1','Durable Truth',1,'PENDING',NULL,NULL,'2026-08-26T00:00:00Z'),
  ('G2','Unbounded Intake',2,'PENDING',NULL,'NEEDS_SOURCE: no official chat export ingested yet','2026-08-26T00:00:00Z'),
  ('G3','Governor',3,'PENDING',NULL,NULL,'2026-08-26T00:00:00Z'),
  ('G4','Workflow Runtime',4,'PENDING',NULL,NULL,'2026-08-26T00:00:00Z'),
  ('G5','Agent Team',5,'PENDING',NULL,'BLOCKED_PROVIDER_ACCESS: no provider auth wired','2026-08-26T00:00:00Z'),
  ('G6','Functional Self',6,'PENDING',NULL,NULL,'2026-08-26T00:00:00Z'),
  ('G7','PortfolioOps',7,'PENDING',NULL,NULL,'2026-08-26T00:00:00Z'),
  ('G8','Mission Control',8,'PENDING',NULL,NULL,'2026-08-26T00:00:00Z'),
  ('G9','Evolution Lab',9,'PENDING',NULL,NULL,'2026-08-26T00:00:00Z'),
  ('G10','Windows Product',10,'PENDING',NULL,NULL,'2026-08-26T00:00:00Z'),
  ('G11','YENO 1.0 Acceptance',11,'PENDING',NULL,NULL,'2026-08-26T00:00:00Z'),
  ('G12','Adaptive Complete',12,'PENDING',NULL,NULL,'2026-08-26T00:00:00Z'),
  ('G13','Fleet Complete',13,'PENDING',NULL,NULL,'2026-08-26T00:00:00Z'),
  ('G14','Frontier Complete',14,'PENDING',NULL,NULL,'2026-08-26T00:00:00Z');

CREATE TABLE work_orders (
  wo_id         TEXT PRIMARY KEY,
  gate_id       TEXT NOT NULL REFERENCES gates(gate_id),
  goal          TEXT NOT NULL,
  source_refs   TEXT NOT NULL,
  baseline_ref  TEXT NOT NULL,
  allowed_paths TEXT NOT NULL,
  denied_paths  TEXT NOT NULL,
  authority     TEXT NOT NULL CHECK (authority IN ('A0','A1','A2','A3','A4','A5','A6')),
  network       TEXT NOT NULL CHECK (network IN ('NONE','LOCALHOST','ALLOWLIST')),
  cost_p90_krw  INTEGER NOT NULL CHECK (cost_p90_krw >= 0),
  deadline      TEXT,
  acceptance    TEXT NOT NULL,
  evidence_ref  TEXT,
  rollback      TEXT NOT NULL,
  state         TEXT NOT NULL CHECK (state IN ('OPEN','CLOSED_PASS','CLOSED_FAIL','ABANDONED')),
  created_at    TEXT NOT NULL,
  closed_at     TEXT
) STRICT;

-- A work order can only be closed as passing when it carries evidence.
CREATE TRIGGER trg_work_order_close_needs_evidence
BEFORE UPDATE ON work_orders
WHEN NEW.state = 'CLOSED_PASS' AND (NEW.evidence_ref IS NULL OR NEW.evidence_ref = '')
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: CLOSED_PASS requires evidence_ref');
END;

-- A gate can only be marked PASSED when it carries evidence.
CREATE TRIGGER trg_gate_pass_needs_evidence
BEFORE UPDATE ON gates
WHEN NEW.state = 'PASSED' AND (NEW.evidence_ref IS NULL OR NEW.evidence_ref = '')
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: gate PASSED requires evidence_ref');
END;

CREATE TABLE projections (
  name        TEXT PRIMARY KEY,
  last_seq    INTEGER NOT NULL DEFAULT 0 CHECK (last_seq >= 0),
  rows_built  INTEGER NOT NULL DEFAULT 0 CHECK (rows_built >= 0),
  rebuilt_at  TEXT
) STRICT;

INSERT INTO projections (name, last_seq, rows_built, rebuilt_at)
VALUES ('proj_inbox_state', 0, 0, NULL), ('proj_run_state', 0, 0, NULL);

-- Deterministic projections, always rebuildable from the event ledger.
CREATE TABLE proj_inbox_state (
  inbox_id    TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  state       TEXT NOT NULL,
  attempts    INTEGER NOT NULL,
  updated_seq INTEGER NOT NULL
) STRICT;

CREATE TABLE proj_run_state (
  run_id      TEXT PRIMARY KEY,
  goal        TEXT NOT NULL,
  state       TEXT NOT NULL,
  updated_seq INTEGER NOT NULL
) STRICT;

CREATE TABLE backups (
  backup_id       TEXT PRIMARY KEY,
  path            TEXT NOT NULL,
  db_sha256       TEXT NOT NULL,
  manifest_sha256 TEXT NOT NULL,
  event_head_hash TEXT NOT NULL,
  event_count     INTEGER NOT NULL CHECK (event_count >= 0),
  size_bytes      INTEGER NOT NULL CHECK (size_bytes >= 0),
  created_at      TEXT NOT NULL,
  verified_at     TEXT,
  verify_result   TEXT CHECK (verify_result IN ('OK','FAILED'))
) STRICT;

CREATE VIEW v_release_status AS
SELECT
  (SELECT version FROM release_state WHERE id = 1) AS version,
  (SELECT current_gate FROM release_state WHERE id = 1) AS current_gate,
  (SELECT COUNT(*) FROM gates WHERE state = 'PASSED') AS gates_passed,
  (SELECT COUNT(*) FROM gates) AS gates_total,
  (SELECT COUNT(*) FROM work_orders WHERE state = 'OPEN') AS work_orders_open,
  (SELECT COUNT(*) FROM backups WHERE verify_result = 'OK') AS backups_verified;
