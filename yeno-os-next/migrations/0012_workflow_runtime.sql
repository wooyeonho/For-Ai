-- YENO Living OS — 0012_workflow_runtime.sql
-- G4 Workflow Runtime: durable job queue, retry/backoff/dead-letter, worker
-- claims fenced by the lease token, artifact store, scheduler OFF by default,
-- and an external-effect ledger whose whole purpose is to make a duplicated
-- external effect impossible to hide.
--
-- The rule this schema enforces: a crash is not a licence to do the same thing
-- to the outside world twice. An external effect is claimed *before* it happens
-- under a unique idempotency key, so a resumed worker either finds the previous
-- claim (and refuses) or is the first and only actor.

PRAGMA foreign_keys = ON;

------------------------------------------------------------------------------
-- 1. Durable queue
------------------------------------------------------------------------------

CREATE TABLE jobs (
  job_id          TEXT PRIMARY KEY,
  queue           TEXT NOT NULL,
  kind            TEXT NOT NULL,
  payload_json    TEXT NOT NULL,
  payload_hash    TEXT NOT NULL,
  -- Enqueue idempotency: the same logical work enqueued twice is one job.
  dedupe_key      TEXT NOT NULL,
  run_id          TEXT REFERENCES runs(run_id),
  step_id         TEXT REFERENCES run_steps(step_id),
  authority       TEXT NOT NULL CHECK (authority IN ('A0','A1','A2','A3','A4','A5','A6')),
  state           TEXT NOT NULL CHECK (state IN
                    ('READY','LEASED','DONE','FAILED','DEAD_LETTER','CANCELLED')),
  attempt         INTEGER NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  max_attempts    INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts >= 1),
  priority        INTEGER NOT NULL DEFAULT 0,
  available_at    TEXT NOT NULL,
  leased_by       TEXT,
  -- Monotonic per job and never reset, so a token from a dead worker is dead too.
  lease_epoch     INTEGER NOT NULL DEFAULT 0 CHECK (lease_epoch >= 0),
  lease_token     INTEGER CHECK (lease_token > 0),
  lease_expires_at TEXT,
  last_error      TEXT,
  artifact_ref    TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  UNIQUE (queue, dedupe_key),
  -- A leased job always names its holder and the fencing token it was handed.
  CHECK ((state = 'LEASED') = (leased_by IS NOT NULL AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)),
  CHECK (attempt <= max_attempts)
) STRICT;

CREATE INDEX idx_jobs_ready ON jobs(queue, state, available_at, priority);
CREATE INDEX idx_jobs_run ON jobs(run_id);

-- Attempt history is evidence, so it is append-only and never rewritten.
CREATE TABLE job_attempts (
  attempt_id   TEXT PRIMARY KEY,
  job_id       TEXT NOT NULL REFERENCES jobs(job_id),
  attempt      INTEGER NOT NULL CHECK (attempt >= 1),
  worker       TEXT NOT NULL,
  lease_token  INTEGER NOT NULL CHECK (lease_token > 0),
  started_at   TEXT NOT NULL,
  ended_at     TEXT,
  outcome      TEXT CHECK (outcome IN ('DONE','RETRY','DEAD_LETTER','CANCELLED','LEASE_LOST')),
  error        TEXT,
  backoff_ms   INTEGER CHECK (backoff_ms >= 0),
  UNIQUE (job_id, attempt)
) STRICT;

CREATE TRIGGER trg_job_attempts_no_delete
BEFORE DELETE ON job_attempts
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: job attempt history cannot be deleted');
END;

-- An attempt row may only be closed once; its identity and result never change.
CREATE TRIGGER trg_job_attempts_append_only_result
BEFORE UPDATE ON job_attempts
WHEN OLD.outcome IS NOT NULL
  OR NEW.job_id <> OLD.job_id
  OR NEW.attempt <> OLD.attempt
  OR NEW.worker <> OLD.worker
  OR NEW.lease_token <> OLD.lease_token
  OR NEW.started_at <> OLD.started_at
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: a recorded job attempt is immutable once it has an outcome');
END;

-- The attempt counter is the retry budget; rewinding it would grant free tries.
CREATE TRIGGER trg_jobs_attempt_monotonic
BEFORE UPDATE ON jobs
WHEN NEW.attempt < OLD.attempt
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: the job attempt counter cannot be rewound');
END;

-- Payload identity is fixed at enqueue: a retry must retry the same work.
CREATE TRIGGER trg_jobs_payload_immutable
BEFORE UPDATE ON jobs
WHEN NEW.payload_hash <> OLD.payload_hash OR NEW.payload_json <> OLD.payload_json
  OR NEW.kind <> OLD.kind OR NEW.queue <> OLD.queue OR NEW.dedupe_key <> OLD.dedupe_key
  OR NEW.authority <> OLD.authority
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: a queued job cannot have its identity or payload rewritten');
END;

CREATE TRIGGER trg_jobs_no_delete
BEFORE DELETE ON jobs
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: jobs are settled, never deleted');
END;

-- Terminal states are terminal. A dead-lettered or cancelled job cannot be
-- quietly moved back to READY to get another run at the outside world.
CREATE TRIGGER trg_jobs_terminal_is_final
BEFORE UPDATE OF state ON jobs
WHEN OLD.state IN ('DONE','DEAD_LETTER','CANCELLED') AND NEW.state <> OLD.state
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: a settled job cannot be resurrected; enqueue a new job instead');
END;

-- A lease can only be taken with a strictly greater fencing token, so a zombie
-- worker that wakes up holding an old token can never re-lease or complete.
CREATE TRIGGER trg_jobs_lease_epoch_monotonic
BEFORE UPDATE OF lease_epoch ON jobs
WHEN NEW.lease_epoch < OLD.lease_epoch
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: a job lease epoch never goes backwards');
END;

CREATE TRIGGER trg_jobs_lease_token_is_epoch
BEFORE UPDATE OF lease_token ON jobs
WHEN NEW.lease_token IS NOT NULL AND NEW.lease_token <> NEW.lease_epoch
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: a job lease token must be the current lease epoch');
END;

-- Taking a lease off its holder is exactly the zombie-completion attack, so a
-- change of holder is only legal together with a new fencing token.
CREATE TRIGGER trg_jobs_lease_no_steal
BEFORE UPDATE ON jobs
WHEN OLD.state = 'LEASED' AND NEW.leased_by IS NOT NULL
  AND NEW.leased_by <> OLD.leased_by AND NEW.lease_epoch <= OLD.lease_epoch
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: a job lease cannot change hands without a new fencing token');
END;

-- Nor may an expired lease be quietly extended for the same holder: recovery
-- goes through reclaim, which spends an attempt and records LEASE_LOST.
CREATE TRIGGER trg_jobs_lease_no_silent_extension
BEFORE UPDATE OF lease_expires_at ON jobs
WHEN OLD.state = 'LEASED' AND NEW.state = 'LEASED'
  AND OLD.lease_expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now')
  AND NEW.lease_epoch <= OLD.lease_epoch
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: an expired lease cannot be extended; reclaim it instead');
END;

-- Dead-letter is a recorded verdict, not a mood: it needs the error that caused
-- it and an exhausted retry budget.
CREATE TRIGGER trg_jobs_dead_letter_needs_reason
BEFORE UPDATE OF state ON jobs
WHEN NEW.state = 'DEAD_LETTER'
  AND (NEW.last_error IS NULL OR TRIM(NEW.last_error) = '' OR NEW.attempt < NEW.max_attempts)
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: dead-letter needs a recorded error and an exhausted retry budget');
END;

-- A3+ work cannot be smuggled through the queue while the stop is engaged.
CREATE TRIGGER trg_jobs_no_enqueue_while_stopped
BEFORE INSERT ON jobs
WHEN NEW.authority IN ('A3','A4','A5','A6')
  AND (SELECT engaged FROM emergency_stop WHERE id = 1) = 1
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: the emergency stop is engaged; no external-effect job may be queued');
END;

CREATE TRIGGER trg_jobs_no_lease_while_stopped
BEFORE UPDATE OF state ON jobs
WHEN NEW.state = 'LEASED' AND (SELECT engaged FROM emergency_stop WHERE id = 1) = 1
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: the emergency stop is engaged; no job may be leased');
END;

------------------------------------------------------------------------------
-- 2. External effect ledger (the anti-duplication core of G4)
------------------------------------------------------------------------------

CREATE TABLE external_effects (
  effect_id      TEXT PRIMARY KEY,
  -- The same intended effect always hashes to the same key, so a second
  -- attempt collides instead of happening twice.
  idempotency_key TEXT NOT NULL,
  job_id         TEXT NOT NULL REFERENCES jobs(job_id),
  attempt        INTEGER NOT NULL CHECK (attempt >= 1),
  kind           TEXT NOT NULL,
  target         TEXT NOT NULL,
  payload_hash   TEXT NOT NULL,
  approval_id    TEXT REFERENCES approvals(approval_id),
  state          TEXT NOT NULL CHECK (state IN ('CLAIMED','COMMITTED','ABANDONED')),
  claimed_at     TEXT NOT NULL,
  settled_at     TEXT,
  evidence_ref   TEXT
) STRICT;

-- One live claim per intent. An ABANDONED claim is a recorded decision that the
-- effect never reached the outside world, and only that releases the key.
CREATE UNIQUE INDEX idx_effects_live_key ON external_effects(idempotency_key)
  WHERE state <> 'ABANDONED';

CREATE TRIGGER trg_effects_no_delete
BEFORE DELETE ON external_effects
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: an external effect record cannot be deleted');
END;

-- The claim is the identity of the effect; only its settlement may be written.
CREATE TRIGGER trg_effects_identity_immutable
BEFORE UPDATE ON external_effects
WHEN NEW.idempotency_key <> OLD.idempotency_key OR NEW.job_id <> OLD.job_id
  OR NEW.kind <> OLD.kind OR NEW.target <> OLD.target OR NEW.payload_hash <> OLD.payload_hash
  OR NEW.attempt <> OLD.attempt OR NEW.claimed_at <> OLD.claimed_at
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: an external effect claim is immutable');
END;

CREATE TRIGGER trg_effects_committed_is_final
BEFORE UPDATE OF state ON external_effects
WHEN OLD.state <> 'CLAIMED' AND NEW.state <> OLD.state
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: a settled external effect cannot change state');
END;

-- Committing an effect that the outside world really saw requires evidence.
CREATE TRIGGER trg_effects_commit_needs_evidence
BEFORE UPDATE OF state ON external_effects
WHEN NEW.state = 'COMMITTED' AND (NEW.evidence_ref IS NULL OR TRIM(NEW.evidence_ref) = '')
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: a committed external effect needs evidence');
END;

-- An A3+ effect needs the approval the governor consumed for it.
CREATE TRIGGER trg_effects_high_authority_needs_approval
BEFORE INSERT ON external_effects
WHEN NEW.approval_id IS NULL
  AND (SELECT authority FROM jobs WHERE job_id = NEW.job_id) IN ('A3','A4','A5','A6')
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: an external effect of an A3+ job needs its Owner approval');
END;

CREATE TRIGGER trg_effects_no_claim_while_stopped
BEFORE INSERT ON external_effects
WHEN (SELECT engaged FROM emergency_stop WHERE id = 1) = 1
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: the emergency stop is engaged; no external effect may be claimed');
END;

------------------------------------------------------------------------------
-- 3. Artifact store (content-addressed, immutable)
------------------------------------------------------------------------------

CREATE TABLE artifacts (
  artifact_id  TEXT PRIMARY KEY,
  job_id       TEXT REFERENCES jobs(job_id),
  run_id       TEXT REFERENCES runs(run_id),
  kind         TEXT NOT NULL,
  sha256       TEXT NOT NULL,
  size_bytes   INTEGER NOT NULL CHECK (size_bytes >= 0),
  path         TEXT,
  created_at   TEXT NOT NULL
) STRICT;

CREATE TRIGGER trg_artifacts_immutable
BEFORE UPDATE ON artifacts
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: artifacts are immutable');
END;

CREATE TRIGGER trg_artifacts_no_delete
BEFORE DELETE ON artifacts
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: artifacts cannot be deleted');
END;

------------------------------------------------------------------------------
-- 4. Scheduler — OFF by default, and it stays off without an Owner reason
------------------------------------------------------------------------------

CREATE TABLE scheduler_state (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  enabled     INTEGER NOT NULL CHECK (enabled IN (0,1)),
  reason      TEXT,
  changed_at  TEXT NOT NULL,
  changed_by  TEXT NOT NULL
) STRICT;

INSERT INTO scheduler_state (id, enabled, reason, changed_at, changed_by)
VALUES (1, 0, 'scheduler is off by default at install', '2026-08-26T00:00:00Z', 'migration:0012_workflow_runtime');

CREATE TRIGGER trg_scheduler_enable_needs_owner
BEFORE UPDATE ON scheduler_state
WHEN OLD.enabled = 0 AND NEW.enabled = 1
  AND (NEW.changed_by <> 'owner' OR NEW.reason IS NULL OR TRIM(NEW.reason) = '')
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: only the Owner enables the scheduler, with a reason');
END;

CREATE TRIGGER trg_scheduler_row_permanent
BEFORE DELETE ON scheduler_state
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: the scheduler switch is permanent');
END;

CREATE TABLE schedules (
  schedule_id  TEXT PRIMARY KEY,
  queue        TEXT NOT NULL,
  kind         TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  interval_ms  INTEGER NOT NULL CHECK (interval_ms >= 1000),
  authority    TEXT NOT NULL CHECK (authority IN ('A0','A1','A2')),
  enabled      INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  last_fired_at TEXT,
  created_at   TEXT NOT NULL
) STRICT;

------------------------------------------------------------------------------
-- 5. Machine-checkable G4 acceptance
------------------------------------------------------------------------------

CREATE VIEW v_g4_acceptance AS
SELECT
  -- Two committed effects for one intended effect is the failure G4 exists to
  -- exclude; the UNIQUE index makes it unreachable, and this counts it anyway.
  (SELECT COUNT(*) FROM (SELECT idempotency_key FROM external_effects
                          WHERE state = 'COMMITTED' GROUP BY idempotency_key HAVING COUNT(*) > 1))
    AS duplicated_effects,
  (SELECT COUNT(*) FROM jobs WHERE state = 'LEASED' AND lease_expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    AS stuck_leases,
  (SELECT COUNT(*) FROM jobs WHERE state = 'DEAD_LETTER' AND (last_error IS NULL OR TRIM(last_error) = ''))
    AS dead_letters_without_reason,
  (SELECT COUNT(*) FROM jobs j WHERE j.state = 'DONE'
     AND EXISTS (SELECT 1 FROM job_attempts a WHERE a.job_id = j.job_id AND a.outcome IS NULL))
    AS done_jobs_with_open_attempts,
  (SELECT COUNT(*) FROM jobs WHERE state = 'DEAD_LETTER') AS dead_lettered,
  (SELECT COUNT(*) FROM jobs WHERE attempt > 1 AND state = 'DONE') AS retried_then_done,
  (SELECT COUNT(*) FROM external_effects WHERE state = 'COMMITTED') AS effects_committed,
  (SELECT COUNT(*) FROM external_effects WHERE state = 'ABANDONED') AS effects_abandoned,
  (SELECT enabled FROM scheduler_state WHERE id = 1) AS scheduler_enabled,
  (SELECT COUNT(*) FROM jobs) AS jobs_total;

------------------------------------------------------------------------------
-- 6. Queue crash soak evidence
------------------------------------------------------------------------------

-- A queue soak cycle is one SIGKILL against a real worker process. Each row
-- records how many times the world actually changed for one intended effect, so
-- the at-most-once claim rests on observed rows rather than on the code reading
-- correct. Like all evidence here it is append-only.
CREATE TABLE queue_soak_cycles (
  cycle_id        TEXT PRIMARY KEY,
  soak_ref        TEXT NOT NULL,
  cycle           INTEGER NOT NULL CHECK (cycle >= 1),
  kill_point      TEXT NOT NULL CHECK (kill_point IN ('after-claim','after-effect')),
  job_id          TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  effect_lines    INTEGER NOT NULL CHECK (effect_lines >= 0),
  resumed_outcome TEXT NOT NULL,
  ok              INTEGER NOT NULL CHECK (ok IN (0,1)),
  detail          TEXT NOT NULL,
  observed_at     TEXT NOT NULL,
  UNIQUE (soak_ref, cycle)
) STRICT;

CREATE TRIGGER trg_queue_soak_append_only
BEFORE UPDATE ON queue_soak_cycles
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: queue soak evidence is append-only');
END;

CREATE TRIGGER trg_queue_soak_no_delete
BEFORE DELETE ON queue_soak_cycles
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: queue soak evidence cannot be deleted');
END;

-- A cycle where the world changed more than once for one key is never "ok".
CREATE TRIGGER trg_queue_soak_honest_verdict
BEFORE INSERT ON queue_soak_cycles
WHEN NEW.ok = 1 AND NEW.effect_lines > 1
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: a cycle with a duplicated external effect cannot be recorded as ok');
END;

CREATE VIEW v_g4_queue_soak AS
SELECT
  soak_ref,
  COUNT(*) AS cycles,
  SUM(ok) AS cycles_ok,
  SUM(CASE WHEN kill_point = 'after-claim' THEN 1 ELSE 0 END) AS killed_after_claim,
  SUM(CASE WHEN kill_point = 'after-effect' THEN 1 ELSE 0 END) AS killed_after_effect,
  MAX(effect_lines) AS worst_effect_lines,
  MIN(observed_at) AS started_at,
  MAX(observed_at) AS ended_at
FROM queue_soak_cycles
GROUP BY soak_ref;
