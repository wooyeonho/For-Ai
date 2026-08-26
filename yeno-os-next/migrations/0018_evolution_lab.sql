------------------------------------------------------------------------------
-- 0018 Evolution Lab (G9) — bounded self-change, proposal-only
--
-- G9 is the gate where YENO is allowed to change itself. That is exactly the
-- capability that must never be earned by a passing test alone, so this
-- migration writes the boundary into the schema before any code can propose
-- anything:
--
--   1. YENO may **propose**, never apply. A proposal is born PROPOSED with no
--      approval and no applied_at, and no code path can shortcut the ladder
--      PROPOSED -> BENCHMARKED -> APPROVED -> APPLIED. Every step is a separate
--      Owner-visible act.
--   2. A proposal cannot be believed without measurement. It may only reach
--      BENCHMARKED when benchmarks measured *these exact bytes* exist, at least
--      one improved, and none regressed. Benchmarks are append-only and a row
--      may not claim PASS while its own numbers moved the wrong way.
--   3. A proposal cannot approve itself. APPROVED requires a live approval row
--      for the exact action `evolution.apply` on this target path, whose payload
--      hash *is* the diff hash, citing an Owner Packet on disk (0011). A patch
--      edited after approval loses it, because the consent is bound to bytes.
--   4. Some parts of the kernel are not up for self-modification at all. The
--      safety layer — migrations, the governor, the event chain, the ledger, the
--      approval path, the validators that judge all of it — is listed in
--      `evolution_forbidden_targets`, and a proposal aimed there is refused on
--      INSERT. YENO cannot propose loosening its own leash.
--   5. Applying is an act on the running system, so it is refused while the
--      emergency stop is engaged, and it must carry the reversal it was approved
--      with. ROLLED_BACK is reachable from APPLIED; nothing is ever deleted.
--
-- Nothing here applies a patch. This migration is the ledger and the refusals;
-- the apply path stays Owner-gated and unbuilt until the Owner asks for it.
--
-- Additive only: new tables, new triggers, new views. No existing object is
-- modified.
------------------------------------------------------------------------------

-- Paths a self-authored change may never target. A pattern, and the reason, so
-- the Owner can read the leash instead of trusting a comment.
CREATE TABLE evolution_forbidden_targets (
  pattern    TEXT PRIMARY KEY,
  reason     TEXT NOT NULL CHECK (TRIM(reason) <> ''),
  added_by   TEXT NOT NULL,
  added_at   TEXT NOT NULL
) STRICT;

INSERT INTO evolution_forbidden_targets (pattern, reason, added_by, added_at) VALUES
  ('migrations/%',
   'the schema is where every refusal lives; a self-change may not rewrite the rules that bind it',
   'owner', '2026-08-26T00:00:00.000Z'),
  ('src/core/governor.mjs',
   'the governor decides what is admitted, including whether a change may be applied',
   'owner', '2026-08-26T00:00:00.000Z'),
  ('src/core/events.mjs',
   'the event chain is the record the Owner audits; a change that edits it can hide itself',
   'owner', '2026-08-26T00:00:00.000Z'),
  ('src/core/hash.mjs',
   'every hash pin, chain link and approval scope is computed here',
   'owner', '2026-08-26T00:00:00.000Z'),
  ('src/domain/governance.mjs',
   'approvals, budgets and cost gates are the Owner''s consent path',
   'owner', '2026-08-26T00:00:00.000Z'),
  ('src/domain/gate.mjs',
   'gate promotion is how progress is claimed; self-promotion is not evolution',
   'owner', '2026-08-26T00:00:00.000Z'),
  ('scripts/independent-validation.mjs',
   'the independent validator is the second opinion; a change may not edit its own judge',
   'owner', '2026-08-26T00:00:00.000Z'),
  ('scripts/assert-seeded-defect-detected.mjs',
   'the seeded-defect detector proves the validators can still fail',
   'owner', '2026-08-26T00:00:00.000Z'),
  ('scripts/red-team-%',
   'the red teams are the attacks the kernel must keep refusing',
   'owner', '2026-08-26T00:00:00.000Z'),
  ('CLAUDE.md',
   'the contract itself: a system that may rewrite its own contract has none',
   'owner', '2026-08-26T00:00:00.000Z');

CREATE TRIGGER trg_forbidden_targets_owner_only_delete
BEFORE DELETE ON evolution_forbidden_targets
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: the forbidden-target list is not shrinkable from inside the kernel');
END;

CREATE TRIGGER trg_forbidden_targets_immutable_pattern
BEFORE UPDATE OF pattern ON evolution_forbidden_targets
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: a forbidden-target pattern is immutable');
END;

-- One proposed change to YENO itself. The bytes live in the vault; this row is
-- the claim about them and the ladder they must climb.
CREATE TABLE change_proposals (
  proposal_id    TEXT PRIMARY KEY,
  -- SELF: YENO proposed it. OWNER: the Owner did. Both climb the same ladder.
  origin         TEXT NOT NULL CHECK (origin IN ('SELF', 'OWNER')),
  target_path    TEXT NOT NULL CHECK (TRIM(target_path) <> ''),
  -- Owner consent is bound to this hash, so edited bytes lose their approval
  diff_sha256    TEXT NOT NULL CHECK (LENGTH(diff_sha256) = 64),
  diff_bytes     INTEGER NOT NULL CHECK (diff_bytes > 0),
  patch_ref      TEXT NOT NULL CHECK (TRIM(patch_ref) <> ''),
  rationale      TEXT NOT NULL CHECK (TRIM(rationale) <> ''),
  risk           TEXT NOT NULL CHECK (risk IN ('LOW', 'MEDIUM', 'HIGH')),
  blast_radius   TEXT NOT NULL CHECK (TRIM(blast_radius) <> ''),
  rollback_plan  TEXT NOT NULL CHECK (TRIM(rollback_plan) <> ''),
  state          TEXT NOT NULL DEFAULT 'PROPOSED'
                 CHECK (state IN ('PROPOSED', 'BENCHMARKED', 'APPROVED', 'APPLIED', 'REJECTED', 'ROLLED_BACK')),
  approval_id    TEXT REFERENCES approvals(approval_id),
  decision_note  TEXT,
  decided_at     TEXT,
  applied_at     TEXT,
  rolled_back_at TEXT,
  created_by     TEXT NOT NULL CHECK (TRIM(created_by) <> ''),
  created_at     TEXT NOT NULL,
  -- the same bytes for the same file are one proposal, never two
  UNIQUE (target_path, diff_sha256)
) STRICT;

CREATE INDEX idx_change_proposals_state ON change_proposals (state, created_at);

-- Born powerless: proposed, unapproved, unapplied. Anything else is a shortcut.
CREATE TRIGGER trg_proposal_starts_powerless
BEFORE INSERT ON change_proposals
WHEN NEW.state <> 'PROPOSED'
  OR NEW.approval_id IS NOT NULL
  OR NEW.applied_at IS NOT NULL
  OR NEW.rolled_back_at IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: a change proposal is born PROPOSED, unapproved and unapplied');
END;

-- The leash. A proposal aimed at the safety layer never exists.
CREATE TRIGGER trg_proposal_target_not_forbidden
BEFORE INSERT ON change_proposals
WHEN EXISTS (SELECT 1 FROM evolution_forbidden_targets f WHERE NEW.target_path LIKE f.pattern)
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: this path is not open to self-modification');
END;

-- What was proposed cannot become something else. The bytes, the file and the
-- reversal are fixed at birth, so an approval always refers to what was read.
CREATE TRIGGER trg_proposal_identity_immutable
BEFORE UPDATE ON change_proposals
WHEN NEW.diff_sha256 <> OLD.diff_sha256
  OR NEW.target_path <> OLD.target_path
  OR NEW.origin <> OLD.origin
  OR NEW.patch_ref <> OLD.patch_ref
  OR NEW.diff_bytes <> OLD.diff_bytes
  OR NEW.rollback_plan <> OLD.rollback_plan
  OR NEW.created_at <> OLD.created_at
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: the identity of a change proposal is immutable once proposed');
END;

-- The ladder, and only the ladder.
CREATE TRIGGER trg_proposal_state_ladder
BEFORE UPDATE OF state ON change_proposals
WHEN NEW.state <> OLD.state
 AND NOT (
      (OLD.state = 'PROPOSED'    AND NEW.state IN ('BENCHMARKED', 'REJECTED'))
   OR (OLD.state = 'BENCHMARKED' AND NEW.state IN ('APPROVED', 'REJECTED'))
   OR (OLD.state = 'APPROVED'    AND NEW.state IN ('APPLIED', 'REJECTED'))
   OR (OLD.state = 'APPLIED'     AND NEW.state = 'ROLLED_BACK')
 )
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: change proposals climb PROPOSED -> BENCHMARKED -> APPROVED -> APPLIED only');
END;

-- Measurement of one proposal's exact bytes. Append-only: yesterday's number
-- cannot be improved after the fact.
CREATE TABLE proposal_benchmarks (
  benchmark_id     TEXT PRIMARY KEY,
  proposal_id      TEXT NOT NULL REFERENCES change_proposals(proposal_id),
  -- which bytes were measured; a benchmark of other bytes proves nothing here
  diff_sha256      TEXT NOT NULL CHECK (LENGTH(diff_sha256) = 64),
  suite            TEXT NOT NULL CHECK (TRIM(suite) <> ''),
  metric           TEXT NOT NULL CHECK (TRIM(metric) <> ''),
  baseline         REAL NOT NULL,
  candidate        REAL NOT NULL,
  higher_is_better INTEGER NOT NULL CHECK (higher_is_better IN (0, 1)),
  verdict          TEXT NOT NULL CHECK (verdict IN ('PASS', 'REGRESSION', 'FAIL')),
  -- who measured; the proposal's own author is allowed to run it, but the row
  -- must say so, and the independent validator recomputes the verdict
  measured_by      TEXT NOT NULL CHECK (TRIM(measured_by) <> ''),
  evidence_ref     TEXT NOT NULL CHECK (TRIM(evidence_ref) <> ''),
  measured_at      TEXT NOT NULL,
  UNIQUE (proposal_id, diff_sha256, suite, metric)
) STRICT;

CREATE INDEX idx_proposal_benchmarks_proposal ON proposal_benchmarks (proposal_id, verdict);

-- A benchmark must be about the proposal it is filed under, as it stands now.
CREATE TRIGGER trg_benchmark_measures_this_diff
BEFORE INSERT ON proposal_benchmarks
WHEN NEW.diff_sha256 <> (SELECT diff_sha256 FROM change_proposals WHERE proposal_id = NEW.proposal_id)
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: a benchmark must measure the exact bytes of the proposal it is filed under');
END;

-- A verdict may not contradict its own numbers.
CREATE TRIGGER trg_benchmark_verdict_matches_numbers
BEFORE INSERT ON proposal_benchmarks
WHEN (NEW.verdict = 'PASS' AND (
        (NEW.higher_is_better = 1 AND NEW.candidate <= NEW.baseline)
     OR (NEW.higher_is_better = 0 AND NEW.candidate >= NEW.baseline)))
  OR (NEW.verdict = 'REGRESSION' AND (
        (NEW.higher_is_better = 1 AND NEW.candidate >= NEW.baseline)
     OR (NEW.higher_is_better = 0 AND NEW.candidate <= NEW.baseline)))
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: a benchmark verdict may not contradict the numbers it reports');
END;

CREATE TRIGGER trg_benchmark_append_only
BEFORE UPDATE ON proposal_benchmarks
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: benchmark measurements are append-only');
END;

CREATE TRIGGER trg_benchmark_no_delete
BEFORE DELETE ON proposal_benchmarks
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: benchmark measurements cannot be deleted');
END;

-- BENCHMARKED means measured, improved, and not regressed anywhere.
CREATE TRIGGER trg_proposal_benchmarked_needs_measurement
BEFORE UPDATE OF state ON change_proposals
WHEN NEW.state = 'BENCHMARKED'
 AND (
      (SELECT COUNT(*) FROM proposal_benchmarks b
        WHERE b.proposal_id = NEW.proposal_id AND b.diff_sha256 = NEW.diff_sha256
          AND b.verdict = 'PASS') = 0
   OR (SELECT COUNT(*) FROM proposal_benchmarks b
        WHERE b.proposal_id = NEW.proposal_id AND b.diff_sha256 = NEW.diff_sha256
          AND b.verdict IN ('REGRESSION', 'FAIL')) > 0
 )
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: a proposal is BENCHMARKED only with a measured improvement and no regression');
END;

-- APPROVED means the Owner approved *these bytes*, with a packet on the record.
CREATE TRIGGER trg_proposal_approved_needs_owner_approval
BEFORE UPDATE OF state ON change_proposals
WHEN NEW.state = 'APPROVED'
 AND (
      NEW.approval_id IS NULL
   OR NOT EXISTS (
        SELECT 1 FROM approvals a
         WHERE a.approval_id = NEW.approval_id
           AND a.payload_hash = NEW.diff_sha256
           AND a.exact_action = 'evolution.apply'
           AND a.target = NEW.target_path
           AND a.revoked = 0
           AND a.uses < a.max_uses
           AND TRIM(a.owner_packet_ref) <> '')
 )
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: approving a change needs a live Owner approval bound to its diff hash');
END;

-- Applying acts on the running system: never while stopped, never without the
-- approval still standing, never without saying when.
CREATE TRIGGER trg_proposal_applied_needs_live_approval
BEFORE UPDATE OF state ON change_proposals
WHEN NEW.state = 'APPLIED'
 AND (
      NEW.applied_at IS NULL
   OR (SELECT engaged FROM emergency_stop WHERE id = 1) = 1
   OR NOT EXISTS (
        SELECT 1 FROM approvals a
         WHERE a.approval_id = NEW.approval_id
           AND a.payload_hash = NEW.diff_sha256
           AND a.revoked = 0)
 )
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: applying a change needs a released stop, an unrevoked approval and an applied_at');
END;

CREATE TRIGGER trg_proposal_rollback_needs_time
BEFORE UPDATE OF state ON change_proposals
WHEN NEW.state = 'ROLLED_BACK' AND NEW.rolled_back_at IS NULL
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: a rollback must record when it happened');
END;

CREATE TRIGGER trg_proposal_no_delete
BEFORE DELETE ON change_proposals
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: change proposals are never deleted, only REJECTED or ROLLED_BACK');
END;

-- The Owner's read of the lab: every proposal, what measured it, and the one
-- sentence that says why it cannot move yet.
CREATE VIEW v_evolution_lab AS
SELECT
  p.proposal_id,
  p.origin,
  p.target_path,
  p.state,
  p.risk,
  SUBSTR(p.diff_sha256, 1, 12) AS diff_short,
  p.diff_bytes,
  (SELECT COUNT(*) FROM proposal_benchmarks b
    WHERE b.proposal_id = p.proposal_id AND b.diff_sha256 = p.diff_sha256) AS benchmarks,
  (SELECT COUNT(*) FROM proposal_benchmarks b
    WHERE b.proposal_id = p.proposal_id AND b.diff_sha256 = p.diff_sha256 AND b.verdict = 'PASS') AS improved,
  (SELECT COUNT(*) FROM proposal_benchmarks b
    WHERE b.proposal_id = p.proposal_id AND b.diff_sha256 = p.diff_sha256
      AND b.verdict IN ('REGRESSION', 'FAIL')) AS regressed,
  p.approval_id,
  CASE
    WHEN p.state IN ('REJECTED', 'ROLLED_BACK', 'APPLIED') THEN 'closed'
    WHEN p.state = 'PROPOSED' AND (SELECT COUNT(*) FROM proposal_benchmarks b
           WHERE b.proposal_id = p.proposal_id AND b.diff_sha256 = p.diff_sha256 AND b.verdict = 'PASS') = 0
      THEN 'needs a measured improvement'
    WHEN p.state = 'PROPOSED' THEN 'measured; not yet moved to BENCHMARKED'
    WHEN p.state = 'BENCHMARKED' THEN 'needs an Owner approval bound to this diff hash'
    WHEN p.state = 'APPROVED' AND (SELECT engaged FROM emergency_stop WHERE id = 1) = 1
      THEN 'approved, but the emergency stop is engaged'
    WHEN p.state = 'APPROVED' THEN 'approved; apply is an Owner act'
    ELSE ''
  END AS blocked_by,
  p.rationale,
  p.blast_radius,
  p.rollback_plan,
  p.created_by,
  p.created_at
FROM change_proposals p;
