-- YENO Living OS — 0001_core.sql
-- Immutable once applied. All later changes go into 0002_*.sql and beyond.
-- Truth kernel: content-addressed vault, provenance, errata/effective view,
-- append-only event hash chain, governor records, safety triggers.

PRAGMA foreign_keys = ON;

------------------------------------------------------------------------------
-- 1. Raw vault and provenance
------------------------------------------------------------------------------

CREATE TABLE blobs (
  sha256      TEXT PRIMARY KEY,
  size_bytes  INTEGER NOT NULL CHECK (size_bytes >= 0),
  bytes       BLOB NOT NULL,
  created_at  TEXT NOT NULL
) STRICT;

CREATE TABLE sources (
  source_id   TEXT PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('CHAT_EXPORT','FILE','LINK','MANUAL','OWNER_STATEMENT')),
  origin_ref  TEXT NOT NULL,
  created_at  TEXT NOT NULL
) STRICT;

-- Same bytes from different origins keep separate provenance rows on purpose.
CREATE TABLE source_versions (
  source_version_id TEXT PRIMARY KEY,
  source_id         TEXT NOT NULL REFERENCES sources(source_id),
  blob_sha256       TEXT NOT NULL REFERENCES blobs(sha256),
  parser_version    TEXT NOT NULL,
  provenance_json   TEXT NOT NULL,
  fetched_at        TEXT NOT NULL,
  confidence        TEXT NOT NULL CHECK (confidence IN ('RAW','PARSED','VERIFIED','DISPUTED')),
  UNIQUE (source_id, blob_sha256, provenance_json, parser_version)
) STRICT;

CREATE INDEX idx_source_versions_source ON source_versions(source_id);
CREATE INDEX idx_source_versions_blob ON source_versions(blob_sha256);

------------------------------------------------------------------------------
-- 2. Decisions and errata (frozen evidence is corrected, never edited)
------------------------------------------------------------------------------

CREATE TABLE decisions (
  decision_id  TEXT PRIMARY KEY,
  ts           TEXT NOT NULL,
  summary      TEXT NOT NULL,
  rationale    TEXT NOT NULL,
  authority    TEXT NOT NULL CHECK (authority IN ('A0','A1','A2','A3','A4','A5','A6')),
  evidence_ref TEXT
) STRICT;

CREATE TABLE errata (
  errata_id       TEXT PRIMARY KEY,
  target_kind     TEXT NOT NULL CHECK (target_kind IN ('SOURCE_VERSION','INBOX_ITEM','PROJECT')),
  target_id       TEXT NOT NULL,
  field           TEXT NOT NULL,
  wrong_value     TEXT,
  corrected_value TEXT,
  decision_id     TEXT NOT NULL REFERENCES decisions(decision_id),
  created_at      TEXT NOT NULL,
  superseded_by   TEXT REFERENCES errata(errata_id)
) STRICT;

CREATE INDEX idx_errata_target ON errata(target_kind, target_id, field);

------------------------------------------------------------------------------
-- 3. Unresolved inbox and projects (title-only promotion is blocked)
------------------------------------------------------------------------------

CREATE TABLE inbox_items (
  inbox_id          TEXT PRIMARY KEY,
  title             TEXT NOT NULL,
  source_version_id TEXT REFERENCES source_versions(source_version_id),
  state             TEXT NOT NULL CHECK (state IN
                      ('BODY_MISSING','NEEDS_SOURCE','PARTIAL','RECOVERED','PROMOTED','BLOCKED','DISABLED')),
  attempts          INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_attempt_at   TEXT,
  next_action       TEXT NOT NULL,
  evidence_ref      TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
) STRICT;

CREATE INDEX idx_inbox_state ON inbox_items(state);

CREATE TABLE projects (
  project_id            TEXT PRIMARY KEY,
  code                  TEXT NOT NULL UNIQUE,
  name                  TEXT NOT NULL,
  program_ug            TEXT,
  status                TEXT NOT NULL CHECK (status IN
                          ('REGISTRY','BUILD','WATCH','ARCHIVE','INCOMPLETE','DISABLED','BLOCKED')),
  priority_raw          INTEGER NOT NULL DEFAULT 0 CHECK (priority_raw BETWEEN -40 AND 100),
  promoted_from_inbox   TEXT REFERENCES inbox_items(inbox_id),
  body_evidence_ref     TEXT,
  owner_confirmation_ref TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
) STRICT;

CREATE TABLE project_relations (
  parent_project_id TEXT NOT NULL REFERENCES projects(project_id),
  child_project_id  TEXT NOT NULL REFERENCES projects(project_id),
  relation          TEXT NOT NULL CHECK (relation IN ('SPLIT_OF','MERGED_INTO','DEPENDS_ON','ADAPTER_OF')),
  created_at        TEXT NOT NULL,
  PRIMARY KEY (parent_project_id, child_project_id, relation)
) STRICT;

-- TSP/SCG/RSP/PCR/UP/UG/X identifiers keep their provenance crosswalk.
CREATE TABLE id_crosswalk (
  id_kind           TEXT NOT NULL CHECK (id_kind IN ('TSP','SCG','RSP','PCR','UP','UG','X')),
  external_id       TEXT NOT NULL,
  source_version_id TEXT REFERENCES source_versions(source_version_id),
  inbox_id          TEXT REFERENCES inbox_items(inbox_id),
  project_id        TEXT REFERENCES projects(project_id),
  note              TEXT,
  created_at        TEXT NOT NULL,
  PRIMARY KEY (id_kind, external_id, created_at)
) STRICT;

------------------------------------------------------------------------------
-- 4. Append-only event ledger with hash chain
------------------------------------------------------------------------------

CREATE TABLE events (
  seq        INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id   TEXT NOT NULL UNIQUE,
  ts         TEXT NOT NULL,
  type       TEXT NOT NULL,
  actor      TEXT NOT NULL,
  authority  TEXT NOT NULL CHECK (authority IN ('A0','A1','A2','A3','A4','A5','A6')),
  payload    TEXT NOT NULL,
  prev_hash  TEXT NOT NULL,
  hash       TEXT NOT NULL UNIQUE
) STRICT;

CREATE INDEX idx_events_type ON events(type);

------------------------------------------------------------------------------
-- 5. Governor: stop, budget, approvals, runs, admission
------------------------------------------------------------------------------

CREATE TABLE emergency_stop (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  engaged    INTEGER NOT NULL CHECK (engaged IN (0,1)),
  reason     TEXT,
  changed_at TEXT NOT NULL,
  changed_by TEXT NOT NULL
) STRICT;

-- Default is stopped: nothing external runs until the Owner resumes.
INSERT INTO emergency_stop (id, engaged, reason, changed_at, changed_by)
VALUES (1, 1, 'default-on at kernel install', '2026-08-26T00:00:00Z', 'migration:0001_core');

CREATE TABLE budget_profiles (
  profile_id        TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  monthly_limit_krw INTEGER NOT NULL CHECK (monthly_limit_krw >= 0),
  spent_krw         INTEGER NOT NULL DEFAULT 0 CHECK (spent_krw >= 0),
  active            INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0,1)),
  owner_promoted    INTEGER NOT NULL DEFAULT 0 CHECK (owner_promoted IN (0,1))
) STRICT;

INSERT INTO budget_profiles (profile_id, name, monthly_limit_krw, spent_krw, active, owner_promoted) VALUES
  ('BP-MIN',   'Minimal 30k',       30000,  0, 0, 1),
  ('BP-LOCAL', 'Local Safe 300k',  300000,  0, 1, 1),
  ('BP-SCALE', 'Scale 3M',        3000000,  0, 0, 0);

CREATE TABLE priority_formulas (
  formula_id TEXT PRIMARY KEY,
  version    INTEGER NOT NULL,
  expression TEXT NOT NULL,
  active     INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL
) STRICT;

INSERT INTO priority_formulas (formula_id, version, expression, active, created_at)
VALUES ('PF-1', 1,
        'raw = 40*owner_value + 25*evidence_strength + 20*reversibility + 15*cost_fit - 40*ax_risk',
        1, '2026-08-26T00:00:00Z');

CREATE TABLE approvals (
  approval_id   TEXT PRIMARY KEY,
  scope_hash    TEXT NOT NULL,
  exact_action  TEXT NOT NULL,
  target        TEXT NOT NULL,
  payload_hash  TEXT NOT NULL,
  max_cost_krw  INTEGER NOT NULL CHECK (max_cost_krw >= 0),
  expires_at    TEXT NOT NULL,
  max_uses      INTEGER NOT NULL DEFAULT 1 CHECK (max_uses >= 1),
  uses          INTEGER NOT NULL DEFAULT 0 CHECK (uses >= 0),
  rollback_plan TEXT NOT NULL,
  revoked       INTEGER NOT NULL DEFAULT 0 CHECK (revoked IN (0,1)),
  granted_by    TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  CHECK (uses <= max_uses)
) STRICT;

CREATE UNIQUE INDEX idx_approvals_scope ON approvals(scope_hash);

CREATE TABLE runs (
  run_id            TEXT PRIMARY KEY,
  goal              TEXT NOT NULL,
  project_id        TEXT REFERENCES projects(project_id),
  authority         TEXT NOT NULL CHECK (authority IN ('A0','A1','A2','A3','A4','A5','A6')),
  method_class      TEXT NOT NULL CHECK (method_class IN ('SAFE','RESTRICTED','AX')),
  network           TEXT NOT NULL CHECK (network IN ('NONE','LOCALHOST','ALLOWLIST')),
  cost_p90_krw      INTEGER CHECK (cost_p90_krw >= 0),
  budget_profile_id TEXT NOT NULL REFERENCES budget_profiles(profile_id),
  approval_id       TEXT REFERENCES approvals(approval_id),
  baseline_ref      TEXT NOT NULL,
  acceptance        TEXT NOT NULL,
  rollback          TEXT NOT NULL,
  state             TEXT NOT NULL CHECK (state IN
                      ('PENDING','RUNNING','PAUSED','DONE','FAILED','CANCELLED','ROLLED_BACK')),
  deadline          TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
) STRICT;

CREATE TABLE run_steps (
  step_id     TEXT PRIMARY KEY,
  run_id      TEXT NOT NULL REFERENCES runs(run_id),
  idx         INTEGER NOT NULL CHECK (idx >= 0),
  kind        TEXT NOT NULL,
  state       TEXT NOT NULL CHECK (state IN
                ('PENDING','RUNNING','DONE','FAILED','DEAD_LETTER','CANCELLED')),
  attempt     INTEGER NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  artifact_ref TEXT,
  error       TEXT,
  started_at  TEXT,
  ended_at    TEXT,
  UNIQUE (run_id, idx)
) STRICT;

-- Every refusal is recorded too, not only the allowed runs.
CREATE TABLE admission_attempts (
  attempt_id  TEXT PRIMARY KEY,
  ts          TEXT NOT NULL,
  goal        TEXT NOT NULL,
  authority   TEXT NOT NULL,
  method_class TEXT NOT NULL,
  decision    TEXT NOT NULL CHECK (decision IN ('ALLOW','DENY')),
  reason_code TEXT NOT NULL,
  detail_json TEXT NOT NULL,
  run_id      TEXT REFERENCES runs(run_id)
) STRICT;

CREATE INDEX idx_admission_ts ON admission_attempts(ts);

-- Single-writer lease with fencing token.
CREATE TABLE write_leases (
  resource     TEXT PRIMARY KEY,
  holder       TEXT NOT NULL,
  fencing_token INTEGER NOT NULL CHECK (fencing_token > 0),
  acquired_at  TEXT NOT NULL,
  expires_at   TEXT NOT NULL
) STRICT;

------------------------------------------------------------------------------
-- 6. Safety triggers
------------------------------------------------------------------------------

-- S1/S2: the event ledger is append-only.
CREATE TRIGGER trg_events_no_update
BEFORE UPDATE ON events
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: events are append-only');
END;

CREATE TRIGGER trg_events_no_delete
BEFORE DELETE ON events
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: events cannot be deleted');
END;

-- S3: raw vault bytes are immutable.
CREATE TRIGGER trg_blobs_immutable
BEFORE UPDATE ON blobs
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: vault blobs are immutable');
END;

CREATE TRIGGER trg_blobs_no_delete
BEFORE DELETE ON blobs
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: vault blobs cannot be deleted');
END;

-- S4: a title-only conversation can never become a project.
CREATE TRIGGER trg_projects_promotion_needs_evidence
BEFORE INSERT ON projects
WHEN NEW.promoted_from_inbox IS NOT NULL
  AND NEW.body_evidence_ref IS NULL
  AND NEW.owner_confirmation_ref IS NULL
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: title-only promotion requires body or owner evidence');
END;

CREATE TRIGGER trg_projects_promotion_needs_evidence_upd
BEFORE UPDATE ON projects
WHEN NEW.promoted_from_inbox IS NOT NULL
  AND NEW.body_evidence_ref IS NULL
  AND NEW.owner_confirmation_ref IS NULL
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: title-only promotion requires body or owner evidence');
END;

-- S5: no RUN while emergency stop is engaged.
CREATE TRIGGER trg_runs_blocked_by_stop
BEFORE INSERT ON runs
WHEN (SELECT engaged FROM emergency_stop WHERE id = 1) = 1
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: emergency stop engaged, no new RUN');
END;

-- S6: unknown or over-budget cost is a hard gate, not a score penalty.
CREATE TRIGGER trg_runs_cost_hard_gate
BEFORE INSERT ON runs
WHEN NEW.cost_p90_krw IS NULL
  OR NEW.cost_p90_krw > (
       SELECT monthly_limit_krw - spent_krw FROM budget_profiles
       WHERE profile_id = NEW.budget_profile_id
     )
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: cost_p90 unknown or exceeds remaining budget');
END;

-- S7: AX methods are never admissible, with or without approval.
CREATE TRIGGER trg_runs_ax_forbidden
BEFORE INSERT ON runs
WHEN NEW.method_class = 'AX'
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: AX method class is never admissible');
END;

-- S8: a non-promoted budget profile cannot be activated.
CREATE TRIGGER trg_budget_profile_promotion
BEFORE UPDATE ON budget_profiles
WHEN NEW.active = 1 AND NEW.owner_promoted = 0
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: budget profile needs Owner promotion before activation');
END;

-- S9: approvals are one-shot scoped grants; scope and payload never mutate.
CREATE TRIGGER trg_approvals_scope_immutable
BEFORE UPDATE ON approvals
WHEN NEW.scope_hash <> OLD.scope_hash
  OR NEW.payload_hash <> OLD.payload_hash
  OR NEW.exact_action <> OLD.exact_action
  OR NEW.target <> OLD.target
  OR NEW.max_uses <> OLD.max_uses
  OR NEW.expires_at <> OLD.expires_at
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: approval scope is immutable, request a new approval');
END;

------------------------------------------------------------------------------
-- 7. Views
------------------------------------------------------------------------------

-- Effective source view: frozen provenance plus the newest non-superseded erratum.
CREATE VIEW v_effective_source_versions AS
SELECT
  sv.source_version_id,
  sv.source_id,
  sv.blob_sha256,
  sv.parser_version,
  COALESCE(e.corrected_value, sv.provenance_json) AS provenance_json,
  sv.fetched_at,
  sv.confidence,
  e.errata_id AS applied_errata_id
FROM source_versions sv
LEFT JOIN errata e
  ON e.target_kind = 'SOURCE_VERSION'
 AND e.target_id = sv.source_version_id
 AND e.field = 'provenance_json'
 AND e.superseded_by IS NULL;

CREATE VIEW v_inbox_coverage AS
SELECT
  state,
  COUNT(*) AS items,
  SUM(CASE WHEN next_action = '' THEN 1 ELSE 0 END) AS missing_next_action
FROM inbox_items
GROUP BY state;

CREATE VIEW v_run_summary AS
SELECT
  r.run_id,
  r.goal,
  r.state,
  r.authority,
  r.cost_p90_krw,
  r.approval_id,
  COUNT(s.step_id) AS steps,
  SUM(CASE WHEN s.state = 'DONE' THEN 1 ELSE 0 END) AS steps_done,
  SUM(CASE WHEN s.state = 'DEAD_LETTER' THEN 1 ELSE 0 END) AS steps_dead
FROM runs r
LEFT JOIN run_steps s ON s.run_id = r.run_id
GROUP BY r.run_id;
