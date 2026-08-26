-- YENO Living OS — 0009_intake.sql
-- G2 Unbounded Intake: parser registry, intake ledger, 144 recovery state
-- machine, link candidates, coverage invariant.
--
-- The rule this schema enforces: a title is not a body, and a body is not a
-- project. Recovery is a recorded attempt with an outcome, never an assumption,
-- and re-importing the same bytes from the same origin can never fork state.

PRAGMA foreign_keys = ON;

------------------------------------------------------------------------------
-- 1. Parser registry (versioned; a parsed row always names what parsed it)
------------------------------------------------------------------------------

CREATE TABLE parsers (
  parser_id     TEXT PRIMARY KEY,
  kind          TEXT NOT NULL CHECK (kind IN ('CHAT_EXPORT','FILE','LINK','MANUAL','OWNER_STATEMENT')),
  version       TEXT NOT NULL,
  media_types   TEXT NOT NULL,
  yields_body   INTEGER NOT NULL CHECK (yields_body IN (0,1)),
  active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  registered_at TEXT NOT NULL,
  UNIQUE (kind, version)
) STRICT;

------------------------------------------------------------------------------
-- 2. Intake ledger (append-only evidence of every accepted/refused input)
------------------------------------------------------------------------------

CREATE TABLE intakes (
  intake_id         TEXT PRIMARY KEY,
  parser_id         TEXT NOT NULL REFERENCES parsers(parser_id),
  source_id         TEXT REFERENCES sources(source_id),
  source_version_id TEXT REFERENCES source_versions(source_version_id),
  origin_ref        TEXT NOT NULL,
  blob_sha256       TEXT NOT NULL,
  size_bytes        INTEGER NOT NULL CHECK (size_bytes >= 0),
  outcome           TEXT NOT NULL CHECK (outcome IN ('ACCEPTED','DUPLICATE','REJECTED')),
  reason            TEXT,
  titles_seen       INTEGER NOT NULL DEFAULT 0 CHECK (titles_seen >= 0),
  bodies_recovered  INTEGER NOT NULL DEFAULT 0 CHECK (bodies_recovered >= 0),
  created_at        TEXT NOT NULL
) STRICT;

CREATE INDEX idx_intakes_blob ON intakes(blob_sha256);

CREATE TRIGGER trg_intakes_no_update
BEFORE UPDATE ON intakes
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: the intake ledger is append-only');
END;

CREATE TRIGGER trg_intakes_no_delete
BEFORE DELETE ON intakes
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: the intake ledger cannot be deleted');
END;

-- An accepted intake must point at the provenance row it created.
CREATE TRIGGER trg_intake_accepted_needs_provenance
BEFORE INSERT ON intakes
WHEN NEW.outcome = 'ACCEPTED' AND NEW.source_version_id IS NULL
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: an accepted intake needs a source_version');
END;

------------------------------------------------------------------------------
-- 3. 144 recovery state machine
------------------------------------------------------------------------------

CREATE TABLE recovery_attempts (
  attempt_id        TEXT PRIMARY KEY,
  inbox_id          TEXT NOT NULL REFERENCES inbox_items(inbox_id),
  method            TEXT NOT NULL CHECK (method IN
                      ('OFFICIAL_EXPORT','LINK_FETCH','LOCAL_FILE','OWNER_STATEMENT','MANUAL_SEARCH')),
  outcome           TEXT NOT NULL CHECK (outcome IN ('RECOVERED','PARTIAL','NOT_FOUND','BLOCKED','REFUSED')),
  source_version_id TEXT REFERENCES source_versions(source_version_id),
  evidence_ref      TEXT,
  detail            TEXT NOT NULL,
  created_at        TEXT NOT NULL
) STRICT;

CREATE INDEX idx_recovery_inbox ON recovery_attempts(inbox_id, created_at);

CREATE TRIGGER trg_recovery_no_update
BEFORE UPDATE ON recovery_attempts
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: a recovery attempt is evidence and cannot be rewritten');
END;

CREATE TRIGGER trg_recovery_no_delete
BEFORE DELETE ON recovery_attempts
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: a recovery attempt cannot be deleted');
END;

-- A recovered body has bytes behind it.
CREATE TRIGGER trg_recovery_recovered_needs_bytes
BEFORE INSERT ON recovery_attempts
WHEN NEW.outcome IN ('RECOVERED','PARTIAL') AND NEW.source_version_id IS NULL
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: a recovered body must name the source_version it came from');
END;

-- Every inbox item always carries a next action; coverage can never silently
-- drop an item by blanking it.
CREATE TRIGGER trg_inbox_needs_next_action_ins
BEFORE INSERT ON inbox_items
WHEN TRIM(NEW.next_action) = ''
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: every inbox item needs a next action');
END;

CREATE TRIGGER trg_inbox_needs_next_action_upd
BEFORE UPDATE ON inbox_items
WHEN TRIM(NEW.next_action) = ''
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: every inbox item needs a next action');
END;

-- RECOVERED/PARTIAL is a claim about bytes: it needs provenance and a recorded
-- attempt that actually produced it.
CREATE TRIGGER trg_inbox_recovered_needs_attempt
BEFORE UPDATE ON inbox_items
WHEN NEW.state IN ('RECOVERED','PARTIAL')
 AND (
   NEW.source_version_id IS NULL
   OR NOT EXISTS (
     SELECT 1 FROM recovery_attempts a
      WHERE a.inbox_id = NEW.inbox_id
        AND a.outcome IN ('RECOVERED','PARTIAL')
        AND a.source_version_id = NEW.source_version_id
   )
 )
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: RECOVERED/PARTIAL requires a recorded recovery attempt with the same source_version');
END;

-- Attempt counters may only move forward, so a failed history cannot be hidden.
CREATE TRIGGER trg_inbox_attempts_monotonic
BEFORE UPDATE OF attempts ON inbox_items
WHEN NEW.attempts < OLD.attempts
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: inbox attempt counts cannot be lowered');
END;

------------------------------------------------------------------------------
-- 4. Named source candidates (an unreachable link stays a recorded state)
------------------------------------------------------------------------------

CREATE TABLE source_candidates (
  candidate_id    TEXT PRIMARY KEY,
  url             TEXT NOT NULL UNIQUE,
  note            TEXT NOT NULL,
  state           TEXT NOT NULL CHECK (state IN ('UNATTEMPTED','FETCHED','UNREACHABLE','DELETED','REFUSED')),
  last_checked_at TEXT,
  evidence_ref    TEXT,
  created_at      TEXT NOT NULL
) STRICT;

-- Claiming a candidate was fetched requires the bytes and the evidence.
CREATE TRIGGER trg_candidate_fetched_needs_evidence
BEFORE UPDATE ON source_candidates
WHEN NEW.state = 'FETCHED' AND (NEW.evidence_ref IS NULL OR TRIM(NEW.evidence_ref) = '')
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: a FETCHED candidate needs evidence of the fetch');
END;

INSERT INTO source_candidates (candidate_id, url, note, state, last_checked_at, evidence_ref, created_at)
VALUES (
  'CAND-x-angeldot-2092234523471737056',
  'https://x.com/angeldot_/status/2092234523471737056',
  'Named source candidate from CLAUDE.md §4. Content is never guessed; access failure or deletion is recorded as state.',
  'UNATTEMPTED',
  NULL,
  NULL,
  '2026-08-26T00:00:00Z'
);

------------------------------------------------------------------------------
-- 5. Coverage invariant
------------------------------------------------------------------------------

-- One row: the intake coverage invariant, recomputed from base tables.
CREATE VIEW v_intake_invariant AS
SELECT
  (SELECT COUNT(*) FROM inbox_items) AS inbox_items,
  (SELECT COUNT(*) FROM inbox_items WHERE TRIM(next_action) = '') AS items_without_next_action,
  (SELECT COUNT(*) FROM inbox_items WHERE state IN ('RECOVERED','PARTIAL') AND source_version_id IS NULL)
    AS recovered_without_bytes,
  (SELECT COUNT(*) FROM projects p
     WHERE p.promoted_from_inbox IS NOT NULL
       AND p.body_evidence_ref IS NULL AND p.owner_confirmation_ref IS NULL) AS title_only_projects,
  (SELECT COUNT(*) FROM intakes WHERE outcome = 'ACCEPTED') AS intakes_accepted,
  (SELECT COUNT(*) FROM intakes WHERE outcome = 'DUPLICATE') AS intakes_duplicate,
  (SELECT COUNT(*) FROM intakes WHERE outcome = 'REJECTED') AS intakes_rejected,
  (SELECT COUNT(*) FROM source_versions) AS source_versions,
  (SELECT COUNT(DISTINCT blob_sha256) FROM source_versions) AS distinct_blobs,
  (SELECT COUNT(*) FROM source_candidates WHERE state = 'UNATTEMPTED') AS candidates_unattempted,
  (SELECT COUNT(*) FROM parsers WHERE active = 1) AS active_parsers;

-- Per-item recovery ledger: state, attempt history, and what happens next.
CREATE VIEW v_recovery_ledger AS
SELECT
  i.inbox_id,
  i.title,
  i.state,
  i.attempts,
  i.next_action,
  i.source_version_id,
  i.evidence_ref,
  (SELECT COUNT(*) FROM recovery_attempts a WHERE a.inbox_id = i.inbox_id) AS attempts_recorded,
  (SELECT a.outcome FROM recovery_attempts a WHERE a.inbox_id = i.inbox_id
    ORDER BY a.created_at DESC, a.attempt_id DESC LIMIT 1) AS last_outcome
FROM inbox_items i;
