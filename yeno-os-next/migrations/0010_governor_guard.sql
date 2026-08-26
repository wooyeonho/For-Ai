-- 0010_governor_guard.sql
-- G3 Governor: move the admission invariants out of JavaScript and into the
-- schema, so a red-team that skips src/ entirely and writes raw SQL is still
-- refused. Every trigger here answers one bypass that the red-team suite runs.

------------------------------------------------------------------------------
-- Emergency stop
------------------------------------------------------------------------------

-- Releasing the stop is an Owner act with a recorded reason. Raw SQL that flips
-- the flag under any other identity is refused.
CREATE TRIGGER trg_stop_release_needs_owner
BEFORE UPDATE ON emergency_stop
WHEN OLD.engaged = 1 AND NEW.engaged = 0
  AND (NEW.changed_by <> 'owner' OR NEW.reason IS NULL OR TRIM(NEW.reason) = '')
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: only the Owner releases the emergency stop, with a reason');
END;

-- The stop row cannot be deleted or duplicated to escape the default-on state.
CREATE TRIGGER trg_stop_no_delete
BEFORE DELETE ON emergency_stop
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: the emergency stop row is permanent');
END;

CREATE TRIGGER trg_stop_single_row
BEFORE INSERT ON emergency_stop
WHEN (SELECT COUNT(*) FROM emergency_stop) > 0
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: the emergency stop has exactly one row');
END;

------------------------------------------------------------------------------
-- Approvals
------------------------------------------------------------------------------

-- One-shot grants: the use counter only moves forward and never past max_uses.
CREATE TRIGGER trg_approval_uses_monotonic
BEFORE UPDATE ON approvals
WHEN NEW.uses < OLD.uses
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: approval use count cannot be rewound');
END;

-- A revoked grant stays revoked; re-granting means a new scope hash.
CREATE TRIGGER trg_approval_revoke_final
BEFORE UPDATE ON approvals
WHEN OLD.revoked = 1 AND NEW.revoked = 0
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: a revoked approval cannot be un-revoked');
END;

-- Deleting the grant would erase the record of what the Owner allowed.
CREATE TRIGGER trg_approvals_no_delete
BEFORE DELETE ON approvals
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: approvals are evidence and are never deleted');
END;

------------------------------------------------------------------------------
-- Admission records
------------------------------------------------------------------------------

-- Denials are the primary G3 evidence, so the record is append-only.
CREATE TRIGGER trg_admission_no_update
BEFORE UPDATE ON admission_attempts
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: admission attempts are append-only');
END;

CREATE TRIGGER trg_admission_no_delete
BEFORE DELETE ON admission_attempts
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: admission attempts are append-only');
END;

------------------------------------------------------------------------------
-- Runs
------------------------------------------------------------------------------

-- A3 and above is an external effect: it needs a live, in-scope Owner grant,
-- checked again at insert time so a forged in-memory decision is not enough.
CREATE TRIGGER trg_runs_high_authority_needs_approval
BEFORE INSERT ON runs
WHEN NEW.authority IN ('A3','A4','A5','A6')
  AND (
    NEW.approval_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM approvals a
       WHERE a.approval_id = NEW.approval_id
         AND a.revoked = 0
         AND a.uses < a.max_uses
         AND a.expires_at > NEW.created_at
         AND a.max_cost_krw >= COALESCE(NEW.cost_p90_krw, a.max_cost_krw + 1)
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: A3+ RUN needs a live in-scope Owner approval');
END;

-- Authority cannot be escalated after admission decided on the lower one.
CREATE TRIGGER trg_runs_no_authority_escalation
BEFORE UPDATE ON runs
WHEN NEW.authority <> OLD.authority
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: RUN authority is fixed at admission');
END;

------------------------------------------------------------------------------
-- Budget
------------------------------------------------------------------------------

-- Spend is a ratchet: rewinding it would re-open an exhausted budget.
CREATE TRIGGER trg_budget_spent_monotonic
BEFORE UPDATE ON budget_profiles
WHEN NEW.spent_krw < OLD.spent_krw
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: recorded spend cannot be lowered');
END;

-- Raising a ceiling is an Owner promotion, not a self-service edit.
CREATE TRIGGER trg_budget_limit_needs_promotion
BEFORE UPDATE ON budget_profiles
WHEN NEW.monthly_limit_krw > OLD.monthly_limit_krw AND NEW.owner_promoted = 0
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: raising a budget ceiling needs Owner promotion');
END;

------------------------------------------------------------------------------
-- Write lease and fencing
------------------------------------------------------------------------------

-- Tokens are monotonic, so a resumed stale worker always loses.
CREATE TRIGGER trg_lease_token_monotonic
BEFORE UPDATE ON write_leases
WHEN NEW.fencing_token <= OLD.fencing_token
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: fencing token must increase');
END;

-- A held, unexpired lease cannot be taken from its holder.
CREATE TRIGGER trg_lease_no_steal
BEFORE UPDATE ON write_leases
WHEN OLD.holder <> ''
  AND NEW.holder <> OLD.holder
  AND NEW.holder <> ''
  AND OLD.expires_at > NEW.acquired_at
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: lease is held and unexpired, it cannot be stolen');
END;

-- Deleting the row would reset the token counter to zero.
CREATE TRIGGER trg_leases_no_delete
BEFORE DELETE ON write_leases
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: lease rows expire, they are not deleted');
END;

------------------------------------------------------------------------------
-- Gate G3 acceptance
------------------------------------------------------------------------------

-- G3 cannot pass without recorded red-team denials for every bypass class.
CREATE TABLE redteam_probes (
  probe_id    TEXT PRIMARY KEY,
  suite_ref   TEXT NOT NULL,
  ts          TEXT NOT NULL,
  bypass_class TEXT NOT NULL CHECK (bypass_class IN
                 ('RAW_SQL','GOVERNOR_API','APPROVAL_REPLAY','APPROVAL_EXPIRY',
                  'APPROVAL_PARTIAL_USE','EMERGENCY_STOP','BUDGET','LEASE','AX_METHOD','EVIDENCE')),
  attack      TEXT NOT NULL,
  outcome     TEXT NOT NULL CHECK (outcome IN ('REFUSED','ALLOWED','UNVERIFIABLE')),
  detail      TEXT NOT NULL,
  evidence_ref TEXT
) STRICT;

CREATE INDEX idx_redteam_class ON redteam_probes(bypass_class);

CREATE TRIGGER trg_redteam_no_update
BEFORE UPDATE ON redteam_probes
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: red-team results are append-only');
END;

CREATE TRIGGER trg_redteam_no_delete
BEFORE DELETE ON redteam_probes
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: red-team results are append-only');
END;

CREATE VIEW v_g3_acceptance AS
WITH classes(bypass_class) AS (
  VALUES ('RAW_SQL'),('GOVERNOR_API'),('APPROVAL_REPLAY'),('APPROVAL_EXPIRY'),
         ('APPROVAL_PARTIAL_USE'),('EMERGENCY_STOP'),('BUDGET'),('LEASE'),('AX_METHOD'),('EVIDENCE')
)
SELECT
  (SELECT COUNT(*) FROM classes c
    WHERE NOT EXISTS (SELECT 1 FROM redteam_probes p
                       WHERE p.bypass_class = c.bypass_class AND p.outcome = 'REFUSED')) AS classes_missing,
  (SELECT COUNT(*) FROM redteam_probes WHERE outcome = 'ALLOWED') AS bypasses_allowed,
  (SELECT COUNT(*) FROM redteam_probes WHERE outcome = 'UNVERIFIABLE') AS probes_unverifiable,
  (SELECT COUNT(*) FROM redteam_probes) AS probes_total,
  (SELECT COUNT(*) FROM admission_attempts WHERE decision = 'DENY') AS denials_recorded;

CREATE TRIGGER trg_g3_pass_needs_redteam
BEFORE UPDATE ON gates
WHEN NEW.gate_id = 'G3' AND NEW.state = 'PASSED' AND OLD.state <> 'PASSED'
  AND (
    (SELECT classes_missing FROM v_g3_acceptance) > 0
    OR (SELECT bypasses_allowed FROM v_g3_acceptance) > 0
  )
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: G3 needs a refused red-team probe in every bypass class');
END;
