#!/usr/bin/env node
// One real pass of the workflow runtime through the kernel ledger, so G4
// acceptance rests on work this OS actually did rather than on scratch soak
// databases: a job that fails and then succeeds after real backoff, a job that
// exhausts its retry budget and dead-letters, and a job whose A2 external effect
// is a local artifact file that is claimed, performed once, and committed with
// evidence.
//
//   node scripts/queue-exercise.mjs [--db state/yeno.db] [--artifact-dir evidence/runtime]
import { appendFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { openDb, DEFAULT_DB_PATH } from '../src/core/db.mjs';
import { migrate, MIGRATIONS_DIR } from '../src/core/migrate.mjs';
import { stopEngaged } from '../src/core/governor.mjs';
import {
  backoffMs,
  claimEffect,
  claimNextJob,
  commitEffect,
  completeJob,
  enqueueJob,
  failJob,
  g4Acceptance,
} from '../src/domain/workflow.mjs';

const REPO = new URL('..', import.meta.url).pathname;
const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1]);
const dbPath = args.get('db') ?? DEFAULT_DB_PATH;
const artifactDir = args.get('artifact-dir') ?? 'evidence/runtime';
const evidenceRef = args.get('evidence') ?? 'evidence/RUN-007.md';
const queue = args.get('queue') ?? 'g4-exercise';

const sleep = (ms) => {
  const until = Date.now() + ms;
  while (Date.now() < until) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.max(1, until - Date.now()));
};

const db = openDb(dbPath);
migrate(db, MIGRATIONS_DIR);
if (stopEngaged(db)) {
  process.stderr.write('REFUSED: the emergency stop is engaged; release it with an Owner reason first\n');
  process.exit(2);
}

mkdirSync(join(REPO, artifactDir), { recursive: true });
const artifactPath = join(artifactDir, 'g4-external-effect.log');
const absArtifact = join(REPO, artifactPath);
const linesBefore = existsSync(absArtifact) ? readFileSync(absArtifact, 'utf8').split('\n').filter(Boolean).length : 0;
const stamp = new Date().toISOString();
const report = { db: dbPath, queue, started_at: stamp, steps: [] };

// 1. A transient failure: one attempt fails, the runtime waits out its own
//    backoff, and the retry succeeds. Nothing here shortcuts the clock.
{
  const { job_id: jobId } = enqueueJob(db, { kind: 'g4.transient', queue, payload: { stamp }, maxAttempts: 3 });
  const first = claimNextJob(db, { queue, worker: 'exercise-a', leaseMs: 60_000 });
  failJob(db, { jobId, worker: 'exercise-a', leaseToken: first.lease_token, error: 'simulated transient upstream error' });
  const wait = backoffMs(1);
  sleep(wait + 50);
  const second = claimNextJob(db, { queue, worker: 'exercise-b', leaseMs: 60_000 });
  if (!second || second.job_id !== jobId) throw new Error('YENO_G4: the retried job did not become claimable again');
  completeJob(db, { jobId, worker: 'exercise-b', leaseToken: second.lease_token, artifactRef: evidenceRef });
  report.steps.push({ step: 'retry_then_done', job_id: jobId, waited_ms: wait, attempts: second.attempt });
}

// 2. An exhausted retry budget must dead-letter with the error on the record,
//    never retry forever and never disappear.
{
  const { job_id: jobId } = enqueueJob(db, { kind: 'g4.permanent', queue, payload: { stamp }, maxAttempts: 2 });
  let attempts = 0;
  for (;;) {
    const lease = claimNextJob(db, { queue, worker: `exercise-dl-${attempts}`, leaseMs: 60_000 });
    if (!lease) {
      sleep(backoffMs(attempts) + 50);
      continue;
    }
    attempts += 1;
    failJob(db, { jobId, worker: `exercise-dl-${attempts - 1}`, leaseToken: lease.lease_token, error: 'simulated permanent failure' });
    const state = db.prepare('SELECT state, last_error FROM jobs WHERE job_id = ?').get(jobId);
    if (state.state === 'DEAD_LETTER') {
      report.steps.push({ step: 'dead_letter', job_id: jobId, attempts, last_error: state.last_error });
      break;
    }
    if (attempts > 5) throw new Error('YENO_G4: the retry budget never ran out');
  }
}

// 3. One real external effect: claimed before it happens, performed exactly
//    once, committed with the evidence that says what happened.
{
  const { job_id: jobId } = enqueueJob(db, { kind: 'g4.effect', queue, payload: { stamp }, maxAttempts: 2 });
  const lease = claimNextJob(db, { queue, worker: 'exercise-effect', leaseMs: 60_000 });
  const intent = { kind: 'file.append', target: `file://${artifactPath}`, payload: { stamp } };
  const claim = claimEffect(db, { jobId, worker: 'exercise-effect', leaseToken: lease.lease_token, ...intent });
  if (!claim.ok) throw new Error(`YENO_G4: the effect claim was refused: ${claim.reason}`);
  appendFileSync(absArtifact, `${stamp} ${jobId} ${claim.idempotency_key}\n`);
  commitEffect(db, claim.effect_id, evidenceRef);
  // The same intent again must be refused, on the record, without touching the
  // file — asked while the lease is still live, as a confused worker would.
  const repeat = claimEffect(db, { jobId, worker: 'exercise-effect', leaseToken: lease.lease_token, ...intent });
  completeJob(db, { jobId, worker: 'exercise-effect', leaseToken: lease.lease_token, artifactRef: artifactPath });
  const linesAfter = readFileSync(absArtifact, 'utf8').split('\n').filter(Boolean).length;
  report.steps.push({
    step: 'external_effect_once',
    job_id: jobId,
    effect_id: claim.effect_id,
    artifact: relative(REPO, absArtifact),
    repeat_refused_with: repeat.reason ?? 'NOT_REFUSED',
    artifact_lines_added: linesAfter - linesBefore,
  });
  if (repeat.ok || linesAfter - linesBefore !== 1) {
    throw new Error('YENO_G4: the same intent was allowed to touch the world twice');
  }
}

report.acceptance = g4Acceptance(db);
report.finished_at = new Date().toISOString();
db.close();

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(report.acceptance.problems.length === 0 ? 'G4_EXERCISE_PASS\n' : 'G4_EXERCISE_INCOMPLETE\n');
process.exit(report.acceptance.problems.length === 0 ? 0 : 1);
