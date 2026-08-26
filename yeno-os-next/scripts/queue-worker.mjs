#!/usr/bin/env node
// A real queue worker in its own OS process. It can be told to SIGKILL itself at
// the most dangerous moment — after the effect claim is durable and after the
// side effect has actually happened, but before the claim is settled — so the
// soak can prove that a resumed worker never repeats the effect.
import { appendFileSync } from 'node:fs';
import { openDb } from '../src/core/db.mjs';
import { migrate } from '../src/core/migrate.mjs';
import { claimEffect, claimNextJob, commitEffect, completeJob } from '../src/domain/workflow.mjs';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1]);

const dbPath = args.get('db');
const worker = args.get('worker') ?? 'worker';
const sideEffectLog = args.get('effect-log');
// 'after-claim' dies before the effect, 'after-effect' dies after the world has
// already changed. Both must end with exactly one line in the side-effect log.
const killAt = args.get('kill-at') ?? null;
const evidence = args.get('evidence') ?? 'evidence/RUN-007.md';

/**
 * Signal delivery is asynchronous, so a bare process.kill() lets the next lines
 * run and the crash never happens. Blocking the main thread afterwards makes the
 * death deterministic: nothing else in this process can execute.
 */
function die(where, detail) {
  process.stdout.write(`killed=${where} ${detail}\n`);
  process.kill(process.pid, 'SIGKILL');
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
}

const db = openDb(dbPath);
migrate(db, args.get('migrations') ?? 'migrations');

const job = claimNextJob(db, { worker, leaseMs: Number(args.get('lease-ms') ?? 30_000) });
if (!job) {
  process.stdout.write('leased=none\n');
  process.exit(3);
}

const intent = { kind: 'soak.external', target: 'file://effect-log', payload: job.payload };
const claim = claimEffect(db, { jobId: job.job_id, worker, leaseToken: job.lease_token, ...intent });
if (!claim.ok) {
  // The whole point: a resumed worker refuses to touch the world a second time.
  process.stdout.write(`refused=${claim.reason}\n`);
  process.exit(4);
}

if (killAt === 'after-claim') die('after-claim', `job=${job.job_id} effect=${claim.effect_id}`);

// The external effect itself. One line here means one visible change to the world.
appendFileSync(sideEffectLog, `${job.job_id} ${claim.idempotency_key}\n`);

if (killAt === 'after-effect') die('after-effect', `job=${job.job_id} effect=${claim.effect_id}`);

commitEffect(db, claim.effect_id, evidence);
completeJob(db, { jobId: job.job_id, worker, leaseToken: job.lease_token });
process.stdout.write(`done=${job.job_id}\n`);
db.close();
