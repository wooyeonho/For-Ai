-- Gate promotion guard. 0002 already refuses a PASSED gate without an
-- evidence_ref; the release train also needs order and per-gate evidence to be
-- unforgeable, because a hand-written UPDATE is exactly how a release train
-- starts lying about itself.

-- Gates pass in release-train order; no skipping ahead.
CREATE TRIGGER trg_gate_pass_in_order
BEFORE UPDATE ON gates
WHEN NEW.state = 'PASSED'
 AND EXISTS (SELECT 1 FROM gates g WHERE g.ordinal < NEW.ordinal AND g.state <> 'PASSED')
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: an earlier gate has not passed yet');
END;

-- G1 Durable Truth needs a passing soak with real kills and real restores.
CREATE TRIGGER trg_g1_pass_needs_soak
BEFORE UPDATE ON gates
WHEN NEW.gate_id = 'G1' AND NEW.state = 'PASSED'
 AND NOT EXISTS (
   SELECT 1 FROM soak_sessions s
    WHERE s.state = 'PASSED' AND s.gate_id = 'G1'
      AND s.kill_count >= 100 AND s.restore_count >= 100
      AND s.completed_cycles >= 100
      AND NOT EXISTS (SELECT 1 FROM durability_probes p WHERE p.soak_id = s.soak_id AND p.ok = 0)
 )
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: G1 needs a passing soak with at least 100 crash/restore cycles');
END;

-- G6 Functional Self is PREP_ONLY until provider access opens G5.
CREATE TRIGGER trg_g6_pass_needs_g5
BEFORE UPDATE ON gates
WHEN NEW.gate_id = 'G6' AND NEW.state = 'PASSED'
 AND (SELECT state FROM gates WHERE gate_id = 'G5') <> 'PASSED'
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: G6 cannot pass before G5 provider access is resolved');
END;
