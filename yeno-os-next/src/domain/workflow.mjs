// G4 Workflow Runtime: a durable queue whose contract is narrower than "jobs
// eventually run". The contract is: **a crash never produces a second external
// effect**. Everything below exists to keep that true across SIGKILL, restart,
// zombie workers and retries.
//
// Shape of one attempt:
//   claimNext  -> lease with a fencing token (monotonic, per job)
//   claimEffect -> insert the effect under a unique idempotency key BEFORE acting
//   act        -> the actual side effect happens here, and only here
//   commitEffect / abandonEffect -> settle with evidence
//   completeJob / failJob -> DONE, retry with backoff, or DEAD_LETTER
//
// A worker that dies between claimEffect and commitEffect leaves a CLAIMED row.
// A resumed worker retrying the same logical effect collides with that row and
// is refused, so the effect is attempted at most once — the retry can only make
// progress after the operator decides what happened to the claim.
import { newId, nowIso } from '../core/ids.mjs';
import { sha256Json } from '../core/hash.mjs';
import { appendEvent } from '../core/events.mjs';
import { stopEngaged } from '../core/governor.mjs';
import { inTransaction } from '../core/db.mjs';

export const DEFAULT_QUEUE = 'default';
export const DEFAULT_MAX_ATTEMPTS = 3;
export const BASE_BACKOFF_MS = 1_000;
export const MAX_BACKOFF_MS = 5 * 60_000;

/**
 * Exponential backoff, deterministic on purpose: the same failure history always
 * produces the same next attempt time, so a resumed queue is reproducible and a
 * soak result can be recomputed rather than trusted.
 */
export function backoffMs(attempt) {
  return Math.min(BASE_BACKOFF_MS * 2 ** Math.max(0, attempt - 1), MAX_BACKOFF_MS);
}

/** The identity of an intended external effect — the same intent, the same key. */
export function idempotencyKey({ kind, target, payloadHash }) {
  return sha256Json({ kind, target, payload_hash: payloadHash });
}

export function enqueueJob(
  db,
  {
    queue = DEFAULT_QUEUE,
    kind,
    payload = {},
    dedupeKey = null,
    runId = null,
    stepId = null,
    authority = 'A2',
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    priority = 0,
    availableAt = null,
  },
  clock = Date,
) {
  if (!kind) throw new Error('YENO_QUEUE: a job needs a kind');
  const at = nowIso(clock);
  const payloadJson = JSON.stringify(payload);
  const payloadHash = sha256Json(payload);
  // Without an explicit dedupe key the payload *is* the key: enqueuing the same
  // work twice must not create two chances to touch the outside world.
  const key = dedupeKey ?? `${kind}:${payloadHash}`;
  const existing = db.prepare('SELECT * FROM jobs WHERE queue = ? AND dedupe_key = ?').get(queue, key);
  if (existing) return { job_id: existing.job_id, state: existing.state, deduped: true };

  const jobId = newId('JOB');
  db.prepare(
    `INSERT INTO jobs (job_id, queue, kind, payload_json, payload_hash, dedupe_key, run_id, step_id,
       authority, state, attempt, max_attempts, priority, available_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'READY', 0, ?, ?, ?, ?, ?)`,
  ).run(
    jobId,
    queue,
    kind,
    payloadJson,
    payloadHash,
    key,
    runId,
    stepId,
    authority,
    maxAttempts,
    priority,
    availableAt ?? at,
    at,
    at,
  );
  appendEvent(db, { type: 'queue.job_enqueued', actor: 'runtime', authority, payload: { job_id: jobId, queue, kind, dedupe_key: key } }, clock);
  return { job_id: jobId, state: 'READY', deduped: false };
}

/**
 * Lease the next runnable job. The fencing token is per job and monotonic, so a
 * worker holding an older token can no longer complete or fail it.
 */
export function claimNextJob(db, { queue = DEFAULT_QUEUE, worker, leaseMs = 30_000 } = {}, clock = Date) {
  if (!worker) throw new Error('YENO_QUEUE: a claim needs a worker identity');
  if (stopEngaged(db)) return null;
  const at = nowIso(clock);
  const leased = inTransaction(db, () => {
    const job = db
      .prepare(
        `SELECT * FROM jobs
          WHERE queue = ? AND state = 'READY' AND available_at <= ?
          ORDER BY priority DESC, available_at ASC, created_at ASC LIMIT 1`,
      )
      .get(queue, at);
    if (!job) return null;
    // The epoch survives a released lease, so a token is never handed out twice.
    const token = job.lease_epoch + 1;
    const attempt = job.attempt + 1;
    if (attempt > job.max_attempts) return null;
    db.prepare(
      `UPDATE jobs SET state = 'LEASED', leased_by = ?, lease_epoch = ?, lease_token = ?, lease_expires_at = ?,
         attempt = ?, updated_at = ? WHERE job_id = ?`,
    ).run(worker, token, token, new Date(clock.now() + leaseMs).toISOString(), attempt, at, job.job_id);
    db.prepare(
      `INSERT INTO job_attempts (attempt_id, job_id, attempt, worker, lease_token, started_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(newId('JAT'), job.job_id, attempt, worker, token, at);
    return { ...job, attempt, lease_token: token, leased_by: worker, state: 'LEASED', payload: JSON.parse(job.payload_json) };
  });
  if (leased) {
    appendEvent(db, { type: 'queue.job_leased', actor: worker, authority: leased.authority, payload: { job_id: leased.job_id, attempt: leased.attempt, lease_token: leased.lease_token } }, clock);
  }
  return leased;
}

/**
 * Refuse anything from a worker that no longer holds a *live* lease. An expired
 * lease is already gone even before the reclaimer notices, so a worker that
 * comes back from a long pause cannot report on work it no longer owns.
 */
function assertLease(db, jobId, worker, leaseToken, clock = Date) {
  const job = db.prepare('SELECT * FROM jobs WHERE job_id = ?').get(jobId);
  if (!job) throw new Error(`YENO_QUEUE: unknown job ${jobId}`);
  if (job.state !== 'LEASED') throw new Error(`YENO_QUEUE: ${jobId} is ${job.state}, not leased`);
  if (job.leased_by !== worker || job.lease_token !== leaseToken) {
    throw new Error(`YENO_QUEUE: stale lease for ${jobId} (holder ${job.leased_by}, token ${job.lease_token})`);
  }
  if (Date.parse(job.lease_expires_at) <= clock.now()) {
    throw new Error(`YENO_QUEUE: stale lease for ${jobId}: it expired at ${job.lease_expires_at}`);
  }
  return job;
}

/**
 * Claim the right to perform one external effect. This is the anti-duplication
 * gate: it is written to the DB *before* the effect happens, so a crash leaves a
 * CLAIMED row that blocks a second attempt at the same intent.
 */
export function claimEffect(
  db,
  { jobId, worker, leaseToken, kind, target, payload = null, payloadHash = null, approvalId = null },
  clock = Date,
) {
  const job = assertLease(db, jobId, worker, leaseToken, clock);
  const hash = payloadHash ?? sha256Json(payload);
  const key = idempotencyKey({ kind, target, payloadHash: hash });
  const prior = db
    .prepare("SELECT * FROM external_effects WHERE idempotency_key = ? AND state <> 'ABANDONED'")
    .get(key);
  if (prior) {
    // Already committed: the world has seen it, so doing it again is the bug.
    // Still CLAIMED: a previous attempt died mid-flight and only the operator
    // can decide whether it reached the outside world.
    return { ok: false, reason: prior.state === 'COMMITTED' ? 'ALREADY_COMMITTED' : 'CLAIM_IN_FLIGHT', effect: prior };
  }
  const effectId = newId('EFF');
  db.prepare(
    `INSERT INTO external_effects (effect_id, idempotency_key, job_id, attempt, kind, target,
       payload_hash, approval_id, state, claimed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'CLAIMED', ?)`,
  ).run(effectId, key, jobId, job.attempt, kind, target, hash, approvalId, nowIso(clock));
  appendEvent(db, { type: 'queue.effect_claimed', actor: worker, authority: job.authority, payload: { effect_id: effectId, job_id: jobId, kind, target, idempotency_key: key } }, clock);
  return { ok: true, effect_id: effectId, idempotency_key: key };
}

export function commitEffect(db, effectId, evidenceRef, clock = Date) {
  if (!evidenceRef) throw new Error('YENO_QUEUE: a committed effect needs evidence');
  const info = db
    .prepare("UPDATE external_effects SET state = 'COMMITTED', settled_at = ?, evidence_ref = ? WHERE effect_id = ? AND state = 'CLAIMED'")
    .run(nowIso(clock), evidenceRef, effectId);
  if (info.changes !== 1) throw new Error(`YENO_QUEUE: ${effectId} is not an open claim`);
  appendEvent(db, { type: 'queue.effect_committed', actor: 'runtime', authority: 'A2', payload: { effect_id: effectId, evidence_ref: evidenceRef } }, clock);
  return { effect_id: effectId, state: 'COMMITTED' };
}

/**
 * Record that a claimed effect never reached the outside world. This is a
 * decision with evidence, not a cleanup: abandoning a claim is what makes the
 * idempotency key reusable, so it must be recorded rather than deleted.
 */
export function abandonEffect(db, effectId, evidenceRef, clock = Date) {
  if (!evidenceRef) throw new Error('YENO_QUEUE: abandoning a claim needs evidence of what happened');
  const info = db
    .prepare("UPDATE external_effects SET state = 'ABANDONED', settled_at = ?, evidence_ref = ? WHERE effect_id = ? AND state = 'CLAIMED'")
    .run(nowIso(clock), evidenceRef, effectId);
  if (info.changes !== 1) throw new Error(`YENO_QUEUE: ${effectId} is not an open claim`);
  appendEvent(db, { type: 'queue.effect_abandoned', actor: 'runtime', authority: 'A2', payload: { effect_id: effectId, evidence_ref: evidenceRef } }, clock);
  return { effect_id: effectId, state: 'ABANDONED' };
}

export function completeJob(db, { jobId, worker, leaseToken, artifactRef = null }, clock = Date) {
  const job = assertLease(db, jobId, worker, leaseToken, clock);
  const at = nowIso(clock);
  inTransaction(db, () => {
    db.prepare(
      `UPDATE jobs SET state = 'DONE', leased_by = NULL, lease_token = NULL, lease_expires_at = NULL,
         artifact_ref = ?, updated_at = ? WHERE job_id = ?`,
    ).run(artifactRef, at, jobId);
    db.prepare("UPDATE job_attempts SET ended_at = ?, outcome = 'DONE' WHERE job_id = ? AND attempt = ?").run(at, jobId, job.attempt);
  });
  appendEvent(db, { type: 'queue.job_done', actor: worker, authority: job.authority, payload: { job_id: jobId, attempt: job.attempt } }, clock);
  return { job_id: jobId, state: 'DONE', attempt: job.attempt };
}

/**
 * Fail one attempt. Retry until the budget is spent, then dead-letter — never
 * silently drop, and never retry forever.
 */
export function failJob(db, { jobId, worker, leaseToken, error }, clock = Date) {
  const job = assertLease(db, jobId, worker, leaseToken, clock);
  if (!error) throw new Error('YENO_QUEUE: a failure needs a recorded error');
  const at = nowIso(clock);
  const exhausted = job.attempt >= job.max_attempts;
  const wait = exhausted ? 0 : backoffMs(job.attempt);
  inTransaction(db, () => {
    if (exhausted) {
      db.prepare(
        `UPDATE jobs SET state = 'DEAD_LETTER', leased_by = NULL, lease_token = NULL, lease_expires_at = NULL,
           last_error = ?, updated_at = ? WHERE job_id = ?`,
      ).run(error, at, jobId);
    } else {
      db.prepare(
        `UPDATE jobs SET state = 'READY', leased_by = NULL, lease_token = NULL, lease_expires_at = NULL,
           last_error = ?, available_at = ?, updated_at = ? WHERE job_id = ?`,
      ).run(error, new Date(clock.now() + wait).toISOString(), at, jobId);
    }
    db.prepare(
      "UPDATE job_attempts SET ended_at = ?, outcome = ?, error = ?, backoff_ms = ? WHERE job_id = ? AND attempt = ?",
    ).run(at, exhausted ? 'DEAD_LETTER' : 'RETRY', error, wait, jobId, job.attempt);
  });
  appendEvent(db, { type: exhausted ? 'queue.job_dead_lettered' : 'queue.job_retry_scheduled', actor: worker, authority: job.authority, payload: { job_id: jobId, attempt: job.attempt, backoff_ms: wait, error } }, clock);
  return { job_id: jobId, state: exhausted ? 'DEAD_LETTER' : 'READY', attempt: job.attempt, backoff_ms: wait, dead_letter: exhausted };
}

/**
 * Reclaim jobs whose worker died. The lease is dropped so the job becomes
 * runnable again — the attempt is *not* refunded, and any effect the dead worker
 * claimed stays claimed, which is what stops a duplicate on resume.
 */
export function reclaimStuckJobs(db, { queue = null } = {}, clock = Date) {
  const at = nowIso(clock);
  const stuck = db
    .prepare(
      `SELECT * FROM jobs WHERE state = 'LEASED' AND lease_expires_at <= ?${queue === null ? '' : ' AND queue = ?'}`,
    )
    .all(...(queue === null ? [at] : [at, queue]));
  const reclaimed = [];
  for (const job of stuck) {
    const exhausted = job.attempt >= job.max_attempts;
    const reason = `lease of ${job.leased_by} expired at ${job.lease_expires_at}`;
    inTransaction(db, () => {
      db.prepare("UPDATE job_attempts SET ended_at = ?, outcome = 'LEASE_LOST', error = ? WHERE job_id = ? AND attempt = ? AND outcome IS NULL").run(at, reason, job.job_id, job.attempt);
      if (exhausted) {
        db.prepare(
          `UPDATE jobs SET state = 'DEAD_LETTER', leased_by = NULL, lease_token = NULL, lease_expires_at = NULL,
             last_error = ?, updated_at = ? WHERE job_id = ?`,
        ).run(reason, at, job.job_id);
      } else {
        db.prepare(
          `UPDATE jobs SET state = 'READY', leased_by = NULL, lease_token = NULL, lease_expires_at = NULL,
             last_error = ?, available_at = ?, updated_at = ? WHERE job_id = ?`,
        ).run(reason, new Date(clock.now() + backoffMs(job.attempt)).toISOString(), at, job.job_id);
      }
    });
    reclaimed.push({ job_id: job.job_id, state: exhausted ? 'DEAD_LETTER' : 'READY', attempt: job.attempt });
    appendEvent(db, { type: 'queue.lease_reclaimed', actor: 'runtime', authority: job.authority, payload: { job_id: job.job_id, previous_holder: job.leased_by, attempt: job.attempt, dead_letter: exhausted } }, clock);
  }
  return reclaimed;
}

/** Cancel a job that has not settled. A cancelled job is never resurrected. */
export function cancelJob(db, jobId, reason, clock = Date) {
  if (!reason) throw new Error('YENO_QUEUE: cancellation needs a reason');
  const job = db.prepare('SELECT * FROM jobs WHERE job_id = ?').get(jobId);
  if (!job) throw new Error(`YENO_QUEUE: unknown job ${jobId}`);
  if (['DONE', 'DEAD_LETTER', 'CANCELLED'].includes(job.state)) {
    throw new Error(`YENO_QUEUE: ${jobId} is already ${job.state}`);
  }
  const at = nowIso(clock);
  inTransaction(db, () => {
    db.prepare(
      `UPDATE jobs SET state = 'CANCELLED', leased_by = NULL, lease_token = NULL, lease_expires_at = NULL,
         last_error = ?, updated_at = ? WHERE job_id = ?`,
    ).run(reason, at, jobId);
    db.prepare("UPDATE job_attempts SET ended_at = ?, outcome = 'CANCELLED', error = ? WHERE job_id = ? AND outcome IS NULL").run(at, reason, jobId);
  });
  appendEvent(db, { type: 'queue.job_cancelled', actor: 'owner', authority: job.authority, payload: { job_id: jobId, reason } }, clock);
  return { job_id: jobId, state: 'CANCELLED' };
}

export function setScheduler(db, enabled, reason, actor, clock = Date) {
  db.prepare('UPDATE scheduler_state SET enabled = ?, reason = ?, changed_at = ?, changed_by = ? WHERE id = 1').run(
    enabled ? 1 : 0,
    reason,
    nowIso(clock),
    actor,
  );
  appendEvent(db, { type: enabled ? 'queue.scheduler_enabled' : 'queue.scheduler_disabled', actor, authority: 'A0', payload: { reason } }, clock);
  return db.prepare('SELECT * FROM scheduler_state WHERE id = 1').get();
}

export function schedulerEnabled(db) {
  return db.prepare('SELECT enabled FROM scheduler_state WHERE id = 1').get().enabled === 1;
}

export function recordArtifact(db, { jobId = null, runId = null, kind, sha256: hash, sizeBytes, path = null }, clock = Date) {
  const artifactId = newId('ART');
  db.prepare(
    `INSERT INTO artifacts (artifact_id, job_id, run_id, kind, sha256, size_bytes, path, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(artifactId, jobId, runId, kind, hash, sizeBytes, path, nowIso(clock));
  return { artifact_id: artifactId, sha256: hash };
}

export function queueReport(db, { queue = null } = {}) {
  const where = queue === null ? '' : ' WHERE queue = ?';
  const args = queue === null ? [] : [queue];
  return {
    generated_at: new Date().toISOString(),
    scheduler: db.prepare('SELECT * FROM scheduler_state WHERE id = 1').get(),
    stop_engaged: stopEngaged(db),
    by_state: db.prepare(`SELECT state, COUNT(*) AS n FROM jobs${where} GROUP BY state ORDER BY state`).all(...args),
    dead_letters: db
      .prepare(`SELECT job_id, queue, kind, attempt, max_attempts, last_error FROM jobs WHERE state = 'DEAD_LETTER'${queue === null ? '' : ' AND queue = ?'} ORDER BY updated_at DESC LIMIT 20`)
      .all(...args),
    open_effect_claims: db
      .prepare("SELECT effect_id, job_id, kind, target, claimed_at FROM external_effects WHERE state = 'CLAIMED' ORDER BY claimed_at")
      .all(),
    acceptance: g4Acceptance(db),
  };
}

/**
 * G4 acceptance, recomputed from rows. `problems` is empty only when the runtime
 * has actually demonstrated retry, dead-letter, lease recovery and a committed
 * external effect that no crash duplicated.
 */
export function g4Acceptance(db) {
  const row = db.prepare('SELECT * FROM v_g4_acceptance').get();
  const problems = [];
  if (row.duplicated_effects > 0) problems.push(`${row.duplicated_effects} external effect(s) were committed twice`);
  if (row.stuck_leases > 0) problems.push(`${row.stuck_leases} job(s) hold an expired lease and were never reclaimed`);
  if (row.dead_letters_without_reason > 0) {
    problems.push(`${row.dead_letters_without_reason} dead-lettered job(s) have no recorded error`);
  }
  if (row.done_jobs_with_open_attempts > 0) {
    problems.push(`${row.done_jobs_with_open_attempts} finished job(s) left an attempt row open`);
  }
  if (row.retried_then_done === 0) problems.push('no job has ever survived a retry, so backoff is unproven');
  if (row.dead_lettered === 0) problems.push('no job has ever been dead-lettered, so the retry budget is unproven');
  if (row.effects_committed === 0) problems.push('no external effect has been committed, so idempotency is unproven');
  // Passing unit tests are not durability evidence: G4 also needs cycles where a
  // real worker process was SIGKILLed and the world still changed at most once.
  const soak = queueSoakEvidence(db);
  if (!soak) {
    problems.push('no queue crash soak has both kill points passing, so at-most-once is unproven under crash');
  }
  return { ...row, queue_soak: soak, problems };
}

/** The strongest queue soak on record, or null when none qualifies. */
export function queueSoakEvidence(db) {
  return (
    db
      .prepare(
        `SELECT * FROM v_g4_queue_soak
          WHERE cycles = cycles_ok AND killed_after_claim > 0 AND killed_after_effect > 0
            AND worst_effect_lines <= 1
          ORDER BY cycles DESC LIMIT 1`,
      )
      .get() ?? null
  );
}
