------------------------------------------------------------------------------
-- 0016 PortfolioOps (G7)
--
-- The registry already holds projects (0001) and the intake already refuses
-- title-only promotion (0009). What is missing is the part that makes a project
-- do work: an adapter that carries one real source through the whole loop, and
-- the two limits that stop the portfolio from growing into a graveyard of
-- half-built things:
--
--   1. Capacity. The Owner's machine runs one heavy task at a time, so at most
--      `portfolio_capacity.max_active` projects may be BUILD or WATCH. Everything
--      else stays in the registry or the archive, where nothing is deleted.
--   2. Demand. A project may only become active once measured demand *and*
--      measured utility are on record, each citing a source. A number with no
--      source is not evidence, and an ambition is not demand.
--
-- The cycle table is the acceptance evidence for G7: one row per pass of
-- `source -> goal -> RUN -> independent verification -> outcome -> memory`. A row
-- may only claim USEFUL if every one of those links really exists and the
-- verification was done by something other than the adapter that produced the
-- artefact. Self-certification is refused in the schema, not in a comment.
--
-- Additive only: no existing table is modified. The two triggers on `projects`
-- add refusals to a table that already exists; they never rewrite a row.
------------------------------------------------------------------------------

-- How many projects may be actively worked at once. One row, Owner-owned.
CREATE TABLE portfolio_capacity (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  max_active INTEGER NOT NULL CHECK (max_active >= 0),
  reason     TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  changed_at TEXT NOT NULL
) STRICT;

INSERT INTO portfolio_capacity (id, max_active, reason, changed_by, changed_at)
VALUES (
  1,
  1,
  'local heavy concurrency is 1 on the Owner''s ~8GB machine: one project may be BUILD or WATCH at a time',
  'owner',
  '2026-08-26T00:00:00.000Z'
);

-- Measured demand or utility for one project. Append-only: a project cannot be
-- made to look wanted by editing yesterday's number.
CREATE TABLE demand_evidence (
  evidence_id TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(project_id),
  kind        TEXT NOT NULL CHECK (kind IN ('DEMAND', 'UTILITY')),
  metric      TEXT NOT NULL CHECK (TRIM(metric) <> ''),
  value       REAL NOT NULL,
  -- where the number came from; without it the row is an opinion
  source_ref  TEXT NOT NULL CHECK (TRIM(source_ref) <> ''),
  observed_at TEXT NOT NULL,
  detail      TEXT NOT NULL,
  recorded_at TEXT NOT NULL
) STRICT;

CREATE INDEX idx_demand_evidence_project ON demand_evidence (project_id, kind);

CREATE TRIGGER trg_demand_evidence_append_only
BEFORE UPDATE ON demand_evidence
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: demand evidence is append-only');
END;

CREATE TRIGGER trg_demand_evidence_no_delete
BEFORE DELETE ON demand_evidence
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: demand evidence cannot be deleted');
END;

-- A project adapter: the code path that carries this project's sources through
-- the loop. Disabled at registration, like every other switch in this kernel.
CREATE TABLE project_adapters (
  adapter_id       TEXT PRIMARY KEY,
  project_id       TEXT NOT NULL REFERENCES projects(project_id),
  kind             TEXT NOT NULL CHECK (TRIM(kind) <> ''),
  contract_version TEXT NOT NULL CHECK (TRIM(contract_version) <> ''),
  output_kind      TEXT NOT NULL CHECK (TRIM(output_kind) <> ''),
  enabled          INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  note             TEXT NOT NULL,
  registered_at    TEXT NOT NULL,
  UNIQUE (project_id, kind)
) STRICT;

-- One pass of the portfolio loop, and the only acceptance evidence G7 accepts.
CREATE TABLE portfolio_cycles (
  cycle_id          TEXT PRIMARY KEY,
  project_id        TEXT NOT NULL REFERENCES projects(project_id),
  adapter_id        TEXT NOT NULL REFERENCES project_adapters(adapter_id),
  -- the raw source this pass consumed
  source_version_id TEXT REFERENCES source_versions(source_version_id),
  -- the goal a council actually selected before any work started
  goal_id           TEXT REFERENCES goals(goal_id),
  -- the durable job that carried it, so a crash mid-pass is recoverable
  job_id            TEXT REFERENCES jobs(job_id),
  artifact_sha256   TEXT,
  -- who checked the artefact; the adapter may not be its own verifier
  verifier          TEXT NOT NULL,
  verified          INTEGER NOT NULL CHECK (verified IN (0, 1)),
  verification_ref  TEXT,
  outcome           TEXT NOT NULL CHECK (outcome IN ('USEFUL', 'NOT_USEFUL', 'REFUSED', 'FAILED')),
  -- what the OS kept from the pass
  memory_id         TEXT REFERENCES memory_items(memory_id),
  detail            TEXT NOT NULL,
  recorded_at       TEXT NOT NULL,
  -- replaying the same pass is the same row, never a second one
  UNIQUE (project_id, adapter_id, source_version_id)
) STRICT;

CREATE INDEX idx_portfolio_cycles_project ON portfolio_cycles (project_id, recorded_at);

CREATE TRIGGER trg_portfolio_cycle_append_only
BEFORE UPDATE ON portfolio_cycles
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: portfolio cycle evidence is append-only');
END;

CREATE TRIGGER trg_portfolio_cycle_no_delete
BEFORE DELETE ON portfolio_cycles
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: portfolio cycle evidence cannot be deleted');
END;

-- A pass may only be recorded as USEFUL when the whole loop is on record: a
-- source, a selected goal, a durable job, an artefact, an independent verifier
-- that is not the adapter, a passing verification, and a memory of the outcome.
CREATE TRIGGER trg_portfolio_cycle_honest_verdict
BEFORE INSERT ON portfolio_cycles
WHEN NEW.outcome = 'USEFUL'
 AND (
   NEW.verified = 0
   OR NEW.source_version_id IS NULL
   OR NEW.goal_id IS NULL
   OR NEW.job_id IS NULL
   OR NEW.artifact_sha256 IS NULL
   OR NEW.memory_id IS NULL
   OR NEW.verification_ref IS NULL
   OR TRIM(NEW.verifier) = ''
   OR NEW.verifier = (SELECT kind FROM project_adapters WHERE adapter_id = NEW.adapter_id)
 )
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: a USEFUL portfolio cycle needs source, goal, job, artifact, memory and an independent verification');
END;

-- A USEFUL pass must name a goal a council really selected, not any goal row.
CREATE TRIGGER trg_portfolio_cycle_goal_was_selected
BEFORE INSERT ON portfolio_cycles
WHEN NEW.outcome = 'USEFUL'
 AND NEW.goal_id IS NOT NULL
 AND NOT EXISTS (
   SELECT 1 FROM goals g
   JOIN council_verdicts v ON v.verdict_id = g.verdict_id
   WHERE g.goal_id = NEW.goal_id
     AND g.state IN ('SELECTED', 'DONE')
     AND v.decision = 'SELECT'
     AND v.constitution_ok = 1
 )
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: a USEFUL portfolio cycle must cite a goal a council selected');
END;

------------------------------------------------------------------------------
-- Scale control on the existing projects table
------------------------------------------------------------------------------

-- No scale without demand: BUILD/WATCH needs measured demand *and* measured
-- utility, each with a source. This is the rule that keeps the registry from
-- turning into a pile of started projects.
CREATE TRIGGER trg_project_activation_needs_demand_insert
BEFORE INSERT ON projects
WHEN NEW.status IN ('BUILD', 'WATCH')
 AND (
   (SELECT COUNT(*) FROM demand_evidence WHERE project_id = NEW.project_id AND kind = 'DEMAND') = 0
   OR (SELECT COUNT(*) FROM demand_evidence WHERE project_id = NEW.project_id AND kind = 'UTILITY') = 0
 )
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: a project becomes active only with recorded demand and utility evidence');
END;

CREATE TRIGGER trg_project_activation_needs_demand_update
BEFORE UPDATE OF status ON projects
WHEN NEW.status IN ('BUILD', 'WATCH')
 AND OLD.status NOT IN ('BUILD', 'WATCH')
 AND (
   (SELECT COUNT(*) FROM demand_evidence WHERE project_id = NEW.project_id AND kind = 'DEMAND') = 0
   OR (SELECT COUNT(*) FROM demand_evidence WHERE project_id = NEW.project_id AND kind = 'UTILITY') = 0
 )
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: a project becomes active only with recorded demand and utility evidence');
END;

-- Capacity is a hard limit, not a preference: the machine that has to run the
-- work is the one that sets it.
CREATE TRIGGER trg_project_activation_capacity_insert
BEFORE INSERT ON projects
WHEN NEW.status IN ('BUILD', 'WATCH')
 AND (SELECT COUNT(*) FROM projects WHERE status IN ('BUILD', 'WATCH'))
     >= (SELECT max_active FROM portfolio_capacity WHERE id = 1)
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: portfolio capacity is full; archive or park a project before activating another');
END;

CREATE TRIGGER trg_project_activation_capacity_update
BEFORE UPDATE OF status ON projects
WHEN NEW.status IN ('BUILD', 'WATCH')
 AND OLD.status NOT IN ('BUILD', 'WATCH')
 AND (SELECT COUNT(*) FROM projects WHERE status IN ('BUILD', 'WATCH') AND project_id <> NEW.project_id)
     >= (SELECT max_active FROM portfolio_capacity WHERE id = 1)
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: portfolio capacity is full; archive or park a project before activating another');
END;
