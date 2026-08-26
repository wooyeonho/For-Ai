#!/usr/bin/env node
// G4 crash soak. Every cycle enqueues one job whose work is a visible external
// effect (a line in a log file), runs a real worker process, SIGKILLs it at the
// worst possible moment, then lets a fresh worker resume. The claim under test is
// not "the job finishes" but "the world changed at most once".
//
//   node scripts/queue-soak.mjs --cycles 12
//
// The queue lives in a scratch DB so a soak never mutates the kernel ledger;
// only the per-cycle evidence rows land in state/yeno.db.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../src/core/db.mjs';
import { migrate } from '../src/core/migrate.mjs';
import { setStop } from '../src/core/governor.mjs';
import { newId, nowIso } from '../src/core/ids.mjs';
import { enqueueJob, queueReport, reclaimStuckJobs } from '../src/domain/workflow.mjs';

const REPO = new URL('..', import.meta.url).pathname;
const WORKER = join(REPO, 'scripts', 'queue-worker.mjs');
const MIGRATIONS = join(REPO, 'migrations');

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1]);
const cycles = Number(args.get('cycles') ?? 8);
const kernelDbPath = args.get('db') ?? process.env.YENO_DB ?? 'state/yeno.db';
const soakRef = args.get('soak-ref') ?? newId('QSOAK');
const evidenceRef = args.get('evidence') ?? 'evidence/RUN-007.md';

const scratchDir = mkdtempSync(join(tmpdir(), 'yeno-queue-soak-'));
const scratchDb = join(scratchDir, 'yeno.db');
const effectLog = join(scratchDir, 'effects.log');

const kernel = openDb(kernelDbPath);
migrate(kernel, MIGRATIONS);

const queueDb = openDb(scratchDb);
migrate(queueDb, MIGRATIONS);
// The scratch queue starts stopped like any fresh install; the soak releases it
// deliberately so the default is never quietly relied upon.
setStop(queueDb, false, `queue soak ${soakRef}`, 'owner');

function runWorker(extra) {
  return spawnSync(
    process.execPath,
    [WORKER, '--db', scratchDb, '--migrations', MIGRATIONS, '--effect-log', effectLog, '--evidence', evidenceRef, ...extra],
    { cwd: REPO, encoding: 'utf8' },
  );
}

const results = [];
try {
  for (let cycle = 1; cycle <= cycles; cycle += 1) {
    const killPoint = cycle % 2 === 0 ? 'after-effect' : 'after-claim';
    writeFileSync(effectLog, '');
    const job = enqueueJob(queueDb, { kind: 'soak.external', payload: { cycle, soak: soakRef }, maxAttempts: 5 });

    // The first worker holds a normal lease, exactly like a healthy worker, and
    // dies while still holding it.
    const first = runWorker(['--worker', `w-${cycle}-a`, '--kill-at', killPoint, '--lease-ms', '30000']);
    const killed = /^killed=/m.test(first.stdout ?? '');
    if (!killed) {
      process.stderr.write(`cycle ${cycle}: worker did not crash as instructed\n${first.stdout}${first.stderr}\n`);
    }

    // The worker is gone without releasing anything. Nobody renews its lease, so
    // it runs out; then recover exactly the way a reboot would and let a fresh
    // worker try the same job again.
    queueDb.prepare("UPDATE jobs SET lease_expires_at = '2000-01-01T00:00:00Z' WHERE job_id = ?").run(job.job_id);
    reclaimStuckJobs(queueDb);
    queueDb.prepare("UPDATE jobs SET available_at = '2000-01-01T00:00:00Z' WHERE job_id = ?").run(job.job_id);
    const second = runWorker(['--worker', `w-${cycle}-b`, '--lease-ms', '30000']);
    const resumed = (second.stdout ?? '').trim().split('\n').pop() ?? '';

    const lines = readFileSync(effectLog, 'utf8').split('\n').filter((l) => l.trim() !== '');
    const keys = new Set(lines.map((l) => l.split(' ')[1]));
    const row = queueDb.prepare('SELECT * FROM external_effects WHERE job_id = ?').get(job.job_id);

    // after-claim: the effect never happened, so the resumed worker must be
    // blocked by the in-flight claim and the world must stay untouched.
    // after-effect: the effect happened once, and the resumed worker must refuse
    // to repeat it rather than "helpfully" retrying.
    const expectLines = killPoint === 'after-effect' ? 1 : 0;
    const ok =
      killed &&
      lines.length === expectLines &&
      keys.size <= 1 &&
      resumed.startsWith('refused=CLAIM_IN_FLIGHT') &&
      row?.state === 'CLAIMED';

    const detail = `kill=${killPoint} killed=${killed} effect_lines=${lines.length} expected=${expectLines} resumed=${resumed} effect_state=${row?.state ?? 'none'}`;
    kernel
      .prepare(
        `INSERT INTO queue_soak_cycles (cycle_id, soak_ref, cycle, kill_point, job_id, idempotency_key,
           effect_lines, resumed_outcome, ok, detail, observed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        newId('QSC'),
        soakRef,
        cycle,
        killPoint,
        job.job_id,
        row?.idempotency_key ?? '',
        lines.length,
        resumed,
        ok ? 1 : 0,
        detail,
        nowIso(Date),
      );
    results.push({ cycle, ok, detail });
    process.stdout.write(`cycle ${cycle}: ${ok ? 'PASS' : 'FAIL'} ${detail}\n`);
  }
} finally {
  const summary = kernel.prepare('SELECT * FROM v_g4_queue_soak WHERE soak_ref = ?').get(soakRef);
  process.stdout.write(`\n${JSON.stringify({ soak_ref: soakRef, summary, queue: queueReport(queueDb).by_state }, null, 2)}\n`);
  queueDb.close();
  kernel.close();
  if (args.get('keep-scratch') === undefined) rmSync(scratchDir, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
process.stdout.write(failed.length === 0 ? `QUEUE_SOAK_PASS ${results.length}/${cycles}\n` : `QUEUE_SOAK_FAIL ${failed.length}\n`);
process.exit(failed.length === 0 && results.length === cycles ? 0 : 1);
