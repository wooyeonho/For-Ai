// G4 Workflow Runtime. The property under test is not "jobs run" but "a crash
// cannot produce a second external effect", so most of these tests kill a worker
// mid-flight and then let a fresh worker try the same work again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './helpers.mjs';
import { setStop } from '../src/core/governor.mjs';
import {
  abandonEffect,
  backoffMs,
  cancelJob,
  claimEffect,
  claimNextJob,
  commitEffect,
  completeJob,
  enqueueJob,
  failJob,
  g4Acceptance,
  idempotencyKey,
  queueReport,
  reclaimStuckJobs,
  schedulerEnabled,
  setScheduler,
} from '../src/domain/workflow.mjs';

function opened() {
  const ctx = freshDb();
  setStop(ctx.db, false, 'workflow tests', 'owner');
  return ctx;
}

const EFFECT = { kind: 'http.post', target: 'https://example.test/hook', payload: { body: 'once' } };

/** Wall-clock passing while a worker is dead, without waiting for it. */
function expireLease(db, jobId) {
  db.prepare("UPDATE jobs SET lease_expires_at = '2000-01-01T00:00:00Z' WHERE job_id = ?").run(jobId);
}

test('the same work enqueued twice is one job', () => {
  const { db, cleanup } = opened();
  try {
    const first = enqueueJob(db, { kind: 'sync.source', payload: { id: 7 } });
    const second = enqueueJob(db, { kind: 'sync.source', payload: { id: 7 } });
    assert.equal(second.job_id, first.job_id);
    assert.equal(second.deduped, true);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM jobs').get().n, 1);
  } finally {
    cleanup();
  }
});

test('a lease hands out a monotonic fencing token and a zombie worker cannot finish the job', () => {
  const { db, cleanup } = opened();
  try {
    const { job_id: jobId } = enqueueJob(db, { kind: 'work', payload: { n: 1 }, maxAttempts: 3 });
    const first = claimNextJob(db, { worker: 'worker-a', leaseMs: -1 });
    assert.equal(first.lease_token, 1);
    // worker-a is now a zombie: the lease is already expired.
    assert.deepEqual(
      reclaimStuckJobs(db).map((r) => r.state),
      ['READY'],
    );
    // A reclaimed job backs off like any other retry, so time has to move on.
    db.prepare("UPDATE jobs SET available_at = '2000-01-01T00:00:00Z' WHERE job_id = ?").run(jobId);
    const second = claimNextJob(db, { worker: 'worker-b' });
    assert.equal(second.lease_token, 2);
    assert.equal(second.attempt, 2, 'a reclaimed attempt is not refunded');
    // The zombie wakes up and tries to report success with its stale token.
    assert.throws(() => completeJob(db, { jobId, worker: 'worker-a', leaseToken: 1 }), /stale lease/);
    assert.throws(() => failJob(db, { jobId, worker: 'worker-a', leaseToken: 1, error: 'boom' }), /stale lease/);
    assert.equal(db.prepare('SELECT state FROM jobs WHERE job_id = ?').get(jobId).state, 'LEASED');
    completeJob(db, { jobId, worker: 'worker-b', leaseToken: second.lease_token });
    assert.equal(db.prepare('SELECT state FROM jobs WHERE job_id = ?').get(jobId).state, 'DONE');
  } finally {
    cleanup();
  }
});

test('an expired lease is already gone, and no raw UPDATE can move it or extend it', () => {
  const { db, cleanup } = opened();
  try {
    const { job_id: jobId } = enqueueJob(db, { kind: 'work', payload: { n: 2 }, maxAttempts: 3 });
    const lease = claimNextJob(db, { worker: 'worker-a', leaseMs: 60_000 });
    expireLease(db, jobId);
    // Nobody renewed it, so the holder has lost the right to report anything.
    assert.throws(
      () => completeJob(db, { jobId, worker: 'worker-a', leaseToken: lease.lease_token }),
      /expired/,
    );
    assert.throws(
      () => claimEffect(db, { jobId, worker: 'worker-a', leaseToken: lease.lease_token, ...EFFECT }),
      /expired/,
    );
    // Nor can it quietly give itself more time, or a stranger take the lease.
    assert.throws(
      () =>
        db
          .prepare("UPDATE jobs SET lease_expires_at = '2099-01-01T00:00:00Z' WHERE job_id = ?")
          .run(jobId),
      /reclaim it instead/,
    );
    assert.throws(
      () => db.prepare("UPDATE jobs SET leased_by = 'attacker' WHERE job_id = ?").run(jobId),
      /without a new fencing token/,
    );
    assert.equal(db.prepare('SELECT leased_by FROM jobs WHERE job_id = ?').get(jobId).leased_by, 'worker-a');
  } finally {
    cleanup();
  }
});

test('a crash between claiming and committing an effect never produces a second effect', () => {
  const { db, cleanup } = opened();
  try {
    const { job_id: jobId } = enqueueJob(db, { kind: 'notify', payload: EFFECT.payload });
    const lease = claimNextJob(db, { worker: 'worker-a', leaseMs: 60_000 });
    const claim = claimEffect(db, { jobId, worker: 'worker-a', leaseToken: lease.lease_token, ...EFFECT });
    assert.equal(claim.ok, true);
    // SIGKILL here: the effect may or may not have reached the outside world,
    // and the dead worker's lease runs out with nobody to renew it.
    expireLease(db, jobId);
    reclaimStuckJobs(db);
    db.prepare("UPDATE jobs SET available_at = '2000-01-01T00:00:00Z' WHERE job_id = ?").run(jobId);
    const retry = claimNextJob(db, { worker: 'worker-b' });
    const second = claimEffect(db, { jobId, worker: 'worker-b', leaseToken: retry.lease_token, ...EFFECT });
    assert.equal(second.ok, false);
    assert.equal(second.reason, 'CLAIM_IN_FLIGHT');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM external_effects').get().n, 1);

    // Only an operator decision reopens the intent, and it is recorded.
    abandonEffect(db, claim.effect_id, 'evidence/RUN-007.md');
    const third = claimEffect(db, { jobId, worker: 'worker-b', leaseToken: retry.lease_token, ...EFFECT });
    assert.equal(third.ok, true);
    commitEffect(db, third.effect_id, 'evidence/RUN-007.md');
    const fourth = claimEffect(db, { jobId, worker: 'worker-b', leaseToken: retry.lease_token, ...EFFECT });
    assert.equal(fourth.reason, 'ALREADY_COMMITTED');
    assert.equal(g4Acceptance(db).duplicated_effects, 0);
  } finally {
    cleanup();
  }
});

test('an effect cannot be committed without evidence, and a settled effect is final', () => {
  const { db, cleanup } = opened();
  try {
    const { job_id: jobId } = enqueueJob(db, { kind: 'notify', payload: { x: 1 } });
    const lease = claimNextJob(db, { worker: 'w' });
    const claim = claimEffect(db, { jobId, worker: 'w', leaseToken: lease.lease_token, ...EFFECT });
    assert.throws(() => commitEffect(db, claim.effect_id, ''), /needs evidence/);
    assert.throws(
      () => db.prepare("UPDATE external_effects SET state = 'COMMITTED' WHERE effect_id = ?").run(claim.effect_id),
      /committed external effect needs evidence/,
    );
    commitEffect(db, claim.effect_id, 'evidence/RUN-007.md');
    assert.throws(
      () => db.prepare("UPDATE external_effects SET state = 'ABANDONED' WHERE effect_id = ?").run(claim.effect_id),
      /settled external effect cannot change state/,
    );
    assert.throws(
      () => db.prepare('DELETE FROM external_effects WHERE effect_id = ?').run(claim.effect_id),
      /cannot be deleted/,
    );
    assert.throws(
      () =>
        db
          .prepare("UPDATE external_effects SET target = 'https://elsewhere.test' WHERE effect_id = ?")
          .run(claim.effect_id),
      /claim is immutable/,
    );
  } finally {
    cleanup();
  }
});

test('retries back off deterministically and then dead-letter with a recorded error', () => {
  const { db, cleanup } = opened();
  try {
    assert.equal(backoffMs(1), 1000);
    assert.equal(backoffMs(3), 4000);
    assert.equal(backoffMs(99), 300000, 'backoff is capped, not unbounded');

    const { job_id: jobId } = enqueueJob(db, { kind: 'flaky', payload: { n: 1 }, maxAttempts: 2 });
    const first = claimNextJob(db, { worker: 'w' });
    const retry = failJob(db, { jobId, worker: 'w', leaseToken: first.lease_token, error: 'upstream 500' });
    assert.equal(retry.state, 'READY');
    assert.equal(retry.backoff_ms, backoffMs(1));
    assert.equal(claimNextJob(db, { worker: 'w' }), null, 'a backed-off job is not runnable yet');

    db.prepare("UPDATE jobs SET available_at = '2000-01-01T00:00:00Z' WHERE job_id = ?").run(jobId);
    const second = claimNextJob(db, { worker: 'w' });
    const dead = failJob(db, { jobId, worker: 'w', leaseToken: second.lease_token, error: 'upstream 500 again' });
    assert.equal(dead.dead_letter, true);
    const row = db.prepare('SELECT state, last_error, attempt FROM jobs WHERE job_id = ?').get(jobId);
    assert.equal(row.state, 'DEAD_LETTER');
    assert.equal(row.attempt, 2);
    assert.match(row.last_error, /500 again/);
    assert.equal(claimNextJob(db, { worker: 'w' }), null, 'a dead-lettered job is never retried');
    assert.throws(() => failJob(db, { jobId, worker: 'w', leaseToken: second.lease_token, error: 'x' }), /not leased/);
  } finally {
    cleanup();
  }
});

test('the queue refuses to fabricate a dead letter, rewind attempts, resurrect or delete a job', () => {
  const { db, cleanup } = opened();
  try {
    const { job_id: jobId } = enqueueJob(db, { kind: 'work', payload: { n: 2 }, maxAttempts: 3 });
    assert.throws(
      () => db.prepare("UPDATE jobs SET state = 'DEAD_LETTER' WHERE job_id = ?").run(jobId),
      /dead-letter needs a recorded error/,
    );
    const lease = claimNextJob(db, { worker: 'w' });
    assert.throws(() => db.prepare('UPDATE jobs SET attempt = 0 WHERE job_id = ?').run(jobId), /cannot be rewound/);
    assert.throws(
      () => db.prepare("UPDATE jobs SET payload_json = '{\"n\":99}' WHERE job_id = ?").run(jobId),
      /cannot have its identity or payload rewritten/,
    );
    assert.throws(() => db.prepare('UPDATE jobs SET lease_token = 0 WHERE job_id = ?').run(jobId), /must be the current lease epoch/);
    completeJob(db, { jobId, worker: 'w', leaseToken: lease.lease_token });
    assert.throws(
      () => db.prepare("UPDATE jobs SET state = 'READY' WHERE job_id = ?").run(jobId),
      /settled job cannot be resurrected/,
    );
    assert.throws(() => db.prepare('DELETE FROM jobs WHERE job_id = ?').run(jobId), /never deleted/);
    assert.throws(
      () => db.prepare('DELETE FROM job_attempts WHERE job_id = ?').run(jobId),
      /attempt history cannot be deleted/,
    );
    assert.throws(
      () => db.prepare("UPDATE job_attempts SET outcome = 'RETRY' WHERE job_id = ?").run(jobId),
      /immutable once it has an outcome/,
    );
  } finally {
    cleanup();
  }
});

test('cancellation is recorded, closes the open attempt, and is final', () => {
  const { db, cleanup } = opened();
  try {
    const { job_id: jobId } = enqueueJob(db, { kind: 'work', payload: { n: 3 } });
    claimNextJob(db, { worker: 'w' });
    assert.throws(() => cancelJob(db, jobId, ''), /needs a reason/);
    cancelJob(db, jobId, 'owner changed the plan');
    const attempt = db.prepare('SELECT outcome, error FROM job_attempts WHERE job_id = ?').get(jobId);
    assert.equal(attempt.outcome, 'CANCELLED');
    assert.throws(() => cancelJob(db, jobId, 'again'), /already CANCELLED/);
    assert.equal(claimNextJob(db, { worker: 'w' }), null);
  } finally {
    cleanup();
  }
});

test('the emergency stop closes the queue, and the scheduler is off until the Owner enables it', () => {
  const { db, cleanup } = freshDb();
  try {
    // Fresh install: the stop is engaged and the scheduler is off.
    assert.equal(schedulerEnabled(db), false);
    assert.throws(
      () => enqueueJob(db, { kind: 'push', payload: { n: 1 }, authority: 'A3' }),
      /no external-effect job may be queued/,
    );
    assert.throws(
      () => db.prepare("UPDATE scheduler_state SET enabled = 1, changed_by = 'agent', reason = 'x' WHERE id = 1").run(),
      /only the Owner enables the scheduler/,
    );
    assert.throws(() => db.prepare('DELETE FROM scheduler_state WHERE id = 1').run(), /permanent/);

    setStop(db, false, 'test', 'owner');
    const { job_id: jobId } = enqueueJob(db, { kind: 'work', payload: { n: 1 } });
    setStop(db, true, 'stop everything', 'owner');
    assert.equal(claimNextJob(db, { worker: 'w' }), null, 'no job may be leased while stopped');
    assert.throws(
      () => db.prepare("UPDATE jobs SET state = 'LEASED', leased_by = 'w', lease_token = 1, lease_expires_at = '2099-01-01T00:00:00Z' WHERE job_id = ?").run(jobId),
      /no job may be leased/,
    );

    setStop(db, false, 'resume', 'owner');
    setScheduler(db, true, 'owner enabled local scheduling', 'owner');
    assert.equal(schedulerEnabled(db), true);
  } finally {
    cleanup();
  }
});

test('an A3+ job cannot touch the outside world without the approval the governor consumed', () => {
  const { db, cleanup } = opened();
  try {
    const { job_id: jobId } = enqueueJob(db, { kind: 'git.push', payload: { sha: 'abc' }, authority: 'A3' });
    const lease = claimNextJob(db, { worker: 'w' });
    assert.throws(
      () => claimEffect(db, { jobId, worker: 'w', leaseToken: lease.lease_token, ...EFFECT }),
      /needs its Owner approval/,
    );
  } finally {
    cleanup();
  }
});

test('idempotency keys are payload-sensitive, and G4 acceptance stays honest', () => {
  const { db, cleanup } = opened();
  try {
    assert.notEqual(
      idempotencyKey({ kind: 'http.post', target: 't', payloadHash: 'a' }),
      idempotencyKey({ kind: 'http.post', target: 't', payloadHash: 'b' }),
    );
    const before = g4Acceptance(db);
    assert.ok(before.problems.length > 0, 'an untested runtime does not get to claim G4');
    assert.equal(queueReport(db).scheduler.enabled, 0);
  } finally {
    cleanup();
  }
});
