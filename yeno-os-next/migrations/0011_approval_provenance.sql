-- 0011_approval_provenance.sql
--
-- An approval row is the only thing standing between YENO and an external
-- effect, so "granted_by = owner" cannot be a self-assigned label. Every grant
-- must cite the Owner Packet it came from, that reference is immutable, and the
-- independent validator re-checks that the file exists on disk. An agent can
-- still type the command, but it cannot claim Owner consent without leaving a
-- packet the Owner can read and dispute.

ALTER TABLE approvals ADD COLUMN owner_packet_ref TEXT NOT NULL DEFAULT '';

CREATE TRIGGER trg_approval_needs_owner_packet
BEFORE INSERT ON approvals
WHEN NEW.owner_packet_ref IS NULL OR TRIM(NEW.owner_packet_ref) = ''
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: an approval must cite the Owner Packet that authorised it');
END;

CREATE TRIGGER trg_approval_packet_immutable
BEFORE UPDATE OF owner_packet_ref ON approvals
WHEN NEW.owner_packet_ref <> OLD.owner_packet_ref
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: the Owner Packet reference of an approval is immutable');
END;

-- Approvals granted before this migration existed cannot be retro-attributed to
-- the Owner: they stay visibly unsourced and unusable.
UPDATE approvals SET revoked = 1 WHERE owner_packet_ref = '' AND revoked = 0;
