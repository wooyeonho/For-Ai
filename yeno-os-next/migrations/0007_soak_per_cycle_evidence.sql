-- YENO Living OS — 0007_soak_per_cycle_evidence.sql
-- Closes a hole found by test: 0006's pass trigger checked that each required
-- probe kind appeared *somewhere* in the session, so a caller that inflated
-- completed_cycles/kill_count/restore_count could pass a session that had only
-- ever probed one cycle. Durability is per cycle, so the evidence must be too:
-- every planned cycle must carry all six passing probe kinds.
--
-- 0006 is already applied and stays untouched; the trigger is replaced here.

PRAGMA foreign_keys = ON;

DROP TRIGGER trg_soak_pass_needs_evidence;

CREATE TRIGGER trg_soak_pass_needs_evidence
BEFORE UPDATE ON soak_sessions
WHEN NEW.state = 'PASSED'
 AND (
   EXISTS (SELECT 1 FROM durability_probes WHERE soak_id = NEW.soak_id AND ok = 0)
   OR NEW.completed_cycles < NEW.planned_cycles
   OR NEW.kill_count = 0
   OR NEW.restore_count = 0
   OR NEW.evidence_ref IS NULL
   -- UNIQUE (soak_id, cycle, kind) caps a cycle at six rows, so requiring
   -- 6 x planned passing rows spread over at least planned distinct cycles is
   -- exactly "every planned cycle exercised every required probe".
   OR (SELECT COUNT(*) FROM durability_probes
        WHERE soak_id = NEW.soak_id AND ok = 1
          AND kind IN ('CRASH_REPLAY','CHAIN_VERIFY','PROJECTION_DETERMINISM',
                       'INTEGRITY','BACKUP_RESTORE','LEASE_FENCING')) < NEW.planned_cycles * 6
   OR (SELECT COUNT(DISTINCT cycle) FROM durability_probes
        WHERE soak_id = NEW.soak_id AND ok = 1) < NEW.planned_cycles
 )
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: a soak session cannot pass without complete per-cycle crash/restore probe evidence');
END;
