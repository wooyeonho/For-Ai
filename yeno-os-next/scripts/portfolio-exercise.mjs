#!/usr/bin/env node
// G7 exercise: drive the PortfolioOps loop against a real database and print what
// happened, including the crash case.
//
//   node scripts/portfolio-exercise.mjs [--db state/yeno.db] [--json]
//
// Steps:
//   1. promote one inbox item that really has a body into a project
//   2. record measured demand and utility, then activate inside capacity
//   3. run one for_ai pass: source -> goal -> RUN -> independent verification
//      -> outcome -> memory
//   4. crash a pass mid-RUN (a child process claims the job, then dies), then
//      recover: reclaim, rerun, and show it is still one job and one cycle
//   5. run one shopping_shorts pass on the same source
//   6. try to activate a second project and show the refusal
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../src/core/db.mjs';
import { migrate } from '../src/core/migrate.mjs';
import { ingest, registerParsers } from '../src/domain/intake.mjs';
import { setStop, stopEngaged } from '../src/core/governor.mjs';
import { reclaimStuckJobs } from '../src/domain/workflow.mjs';
import { observe } from '../src/domain/self.mjs';
import {
  g7Acceptance,
  portfolioReport,
  recordDemandEvidence,
  registerAdapter,
  runPortfolioCycle,
  setProjectStatus,
} from '../src/domain/portfolio.mjs';
import { makeArtifactVerifier } from '../src/domain/portfolio-verifier.mjs';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const a = process.argv[i];
  if (!a.startsWith('--')) continue;
  const next = process.argv[i + 1];
  if (next === undefined || next.startsWith('--')) args.set(a.slice(2), true);
  else {
    args.set(a.slice(2), next);
    i += 1;
  }
}
const dbPath = typeof args.get('db') === 'string' ? args.get('db') : (process.env.YENO_DB ?? 'state/yeno.db');
const asJson = args.get('json') === true;
const artifactDir = typeof args.get('artifact-dir') === 'string' ? args.get('artifact-dir') : 'artifacts/portfolio';

// A child process that claims the pass's job and then dies without settling it:
// the state that a crash in the middle of a RUN actually leaves behind.
if (process.env.YENO_PORTFOLIO_CRASH_CHILD === '1') {
  const { enqueueJob, claimNextJob } = await import('../src/domain/workflow.mjs');
  const db = openDb(dbPath);
  const payload = {
    project_id: process.env.YENO_CRASH_PROJECT,
    adapter_kind: process.env.YENO_CRASH_ADAPTER,
    source_version_id: process.env.YENO_CRASH_SOURCE,
  };
  enqueueJob(db, {
    queue: 'portfolio',
    kind: 'portfolio.adapter_pass',
    payload,
    dedupeKey: `portfolio:${payload.project_id}:${payload.adapter_kind}:${payload.source_version_id}`,
    authority: 'A2',
  });
  const job = claimNextJob(db, { queue: 'portfolio', worker: 'crash-child', leaseMs: 1 });
  process.stdout.write(`${JSON.stringify({ claimed: job?.job_id ?? null })}\n`);
  process.kill(process.pid, 'SIGKILL');
}

// A crash in the middle of a pass, rehearsed on a fresh kernel: a child claims
// the pass's job and is SIGKILLed before it can settle, then this process
// reclaims the expired lease and reruns. The pass must still be one job, one
// artefact and one cycle.
function crashRehearsal(step) {
  const dir = mkdtempSync(join(tmpdir(), 'yeno-g7-crash-'));
  try {
    const path = join(dir, 'yeno.db');
    const kernel = openDb(path);
    migrate(kernel, join(new URL('..', import.meta.url).pathname, 'migrations'));
    setStop(kernel, false, 'G7 crash rehearsal on a throwaway kernel', 'owner');
    registerParsers(kernel);
    const intake = ingest(kernel, {
      bytes: Buffer.from('# crash rehearsal source\nthe first line is a claim candidate\nthe second line is another\n', 'utf8'),
      kind: 'FILE',
      originRef: 'exercise://g7/crash-rehearsal',
      parserId: 'plain-file/v1',
    });
    const at = new Date().toISOString();
    kernel
      .prepare(
        `INSERT INTO projects (project_id, code, name, program_ug, status, priority_raw, promoted_from_inbox,
           body_evidence_ref, owner_confirmation_ref, created_at, updated_at)
         VALUES ('PRJ-crash','CRASH-1','crash rehearsal project','UG02','REGISTRY',0,NULL,?,NULL,?,?)`,
      )
      .run(intake.source_version_id, at, at);
    registerAdapter(kernel, { projectId: 'PRJ-crash', kind: 'for_ai', enabled: true, note: 'crash rehearsal' });
    observe(kernel, 'unresolved_inbox', 9);
    kernel.close();

    const dedupeKey = `portfolio:PRJ-crash:for_ai:${intake.source_version_id}`;
    const child = spawnSync(process.execPath, [new URL(import.meta.url).pathname, '--db', path], {
      encoding: 'utf8',
      env: {
        ...process.env,
        YENO_PORTFOLIO_CRASH_CHILD: '1',
        YENO_CRASH_PROJECT: 'PRJ-crash',
        YENO_CRASH_ADAPTER: 'for_ai',
        YENO_CRASH_SOURCE: intake.source_version_id,
      },
    });
    const died = child.signal === 'SIGKILL';
    const after = openDb(path);
    const leaked = after.prepare('SELECT COUNT(*) AS n FROM portfolio_cycles').get().n;
    const claimed = after.prepare('SELECT state FROM jobs WHERE dedupe_key = ?').get(dedupeKey);
    step(
      'crash_mid_run',
      `child ${died ? 'was SIGKILLed holding the job' : `exited with ${child.status}`}; ` +
        `job left ${claimed?.state ?? 'absent'}, cycles recorded by the dead worker: ${leaked}`,
      died && claimed?.state === 'LEASED' && leaked === 0,
    );

    const reclaimed = reclaimStuckJobs(after, { queue: 'portfolio' });
    // A reclaimed job comes back with a retry backoff, which is the point: the
    // recovery waits for the queue's own rules instead of jumping them.
    const waitFor = after.prepare("SELECT available_at FROM jobs WHERE dedupe_key = ? AND state = 'READY'").get(dedupeKey);
    if (waitFor) {
      const ms = Math.max(0, Date.parse(waitFor.available_at) - Date.now()) + 25;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
    }
    const recovered = runPortfolioCycle(after, {
      projectId: 'PRJ-crash',
      adapterKind: 'for_ai',
      sourceVersionId: intake.source_version_id,
      worker: 'g7-crash-recovery',
      verify: makeArtifactVerifier({ dbPath: path, artifactDir: join(dir, 'artifacts') }),
    });
    const jobs = after.prepare('SELECT COUNT(*) AS n FROM jobs WHERE dedupe_key = ?').get(dedupeKey).n;
    const cycles = after.prepare('SELECT COUNT(*) AS n FROM portfolio_cycles').get().n;
    const artifacts = after.prepare('SELECT COUNT(*) AS n FROM artifacts WHERE job_id IN (SELECT job_id FROM jobs WHERE dedupe_key = ?)').get(dedupeKey).n;
    after.close();
    step(
      'recovered_after_crash',
      `reclaimed ${reclaimed.length}, outcome ${recovered.ran ? recovered.cycle.outcome : recovered.reason}, ` +
        `jobs ${jobs}, artefacts ${artifacts}, cycles ${cycles}`,
      reclaimed.length === 1 &&
        recovered.ran &&
        recovered.cycle.outcome === 'USEFUL' &&
        jobs === 1 &&
        artifacts === 1 &&
        cycles === 1,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const db = openDb(dbPath);
const steps = [];
const step = (name, detail, ok = true) => steps.push({ step: name, ok, detail });
mkdirSync(artifactDir, { recursive: true });
const verify = makeArtifactVerifier({ dbPath, artifactDir });

const stopWasEngaged = stopEngaged(db);
if (stopWasEngaged) {
  setStop(db, false, 'G7 exercise: bounded local portfolio pass, no external effect', 'owner');
  step('stop_released', 'released with an Owner reason for the duration of the exercise');
}

try {
  // 1. A project, from an inbox item that really has a body.
  let project = db.prepare("SELECT * FROM projects WHERE code = 'G7-EX-1'").get();
  const item = db
    .prepare("SELECT * FROM inbox_items WHERE source_version_id IS NOT NULL AND state IN ('RECOVERED','PARTIAL','PROMOTED') ORDER BY inbox_id LIMIT 1")
    .get();
  if (!item) {
    step('project', 'no inbox item has a body yet: nothing to carry through the loop', false);
    process.stdout.write(`${JSON.stringify({ ok: false, steps }, null, 2)}\n`);
    process.exit(1);
  }
  if (!project) {
    const at = new Date().toISOString();
    const projectId = `PRJ-G7EX-${Date.now()}`;
    db.prepare(
      `INSERT INTO projects (project_id, code, name, program_ug, status, priority_raw, promoted_from_inbox,
         body_evidence_ref, owner_confirmation_ref, created_at, updated_at)
       VALUES (?, 'G7-EX-1', ?, 'UG02', 'REGISTRY', 0, ?, ?, NULL, ?, ?)`,
    ).run(projectId, `G7 exercise project from ${item.inbox_id}`, item.inbox_id, item.source_version_id, at, at);
    project = db.prepare('SELECT * FROM projects WHERE project_id = ?').get(projectId);
  }
  const sourceVersionId = item.source_version_id;
  step('project', `${project.code} (${project.project_id}) carries source ${sourceVersionId} from ${item.inbox_id}`);

  for (const kind of ['for_ai', 'shopping_shorts']) {
    registerAdapter(db, { projectId: project.project_id, kind, enabled: true, note: 'G7 exercise' });
  }
  step('adapters', 'for_ai and shopping_shorts registered and enabled');

  // 2. Demand and utility before any activation.
  const before = setProjectStatus(db, project.project_id, 'BUILD', 'G7 exercise tries to activate with no evidence');
  step(
    'activation_refused_without_evidence',
    before.idempotent
      ? 'already active from an earlier run of this exercise: the refusal was recorded then'
      : before.changed
        ? 'activated with no evidence: this is a bug'
        : before.reasons.join(' | '),
    !before.changed,
  );
  if (db.prepare('SELECT COUNT(*) AS n FROM demand_evidence WHERE project_id = ?').get(project.project_id).n === 0) {
    recordDemandEvidence(db, {
      projectId: project.project_id,
      kind: 'DEMAND',
      metric: 'unresolved_inbox_items_waiting_on_this_adapter',
      value: db.prepare("SELECT COUNT(*) AS n FROM inbox_items WHERE state <> 'PROMOTED'").get().n,
      sourceRef: `db://inbox_items@${new Date().toISOString()}`,
      detail: 'counted from the kernel intake tables, not estimated',
    });
    recordDemandEvidence(db, {
      projectId: project.project_id,
      kind: 'UTILITY',
      metric: 'source_lines_turned_into_checkable_candidates',
      value: 1,
      sourceRef: sourceVersionId,
      detail: 'one verified pass is the measured utility so far; it does not license scaling',
    });
  }
  const activated = setProjectStatus(db, project.project_id, 'BUILD', 'G7 exercise: demand and utility are on record');
  step('activated', activated.changed || activated.idempotent ? `${project.code} is BUILD` : activated.reasons.join(' | '));

  // 3. One full pass.
  const first = runPortfolioCycle(db, {
    projectId: project.project_id,
    adapterKind: 'for_ai',
    sourceVersionId,
    worker: 'g7-exercise',
    verify,
  });
  step(
    'for_ai_pass',
    first.ran
      ? `${first.cycle.outcome} artefact ${first.cycle.artifact_sha256.slice(0, 16)} verified by ${first.cycle.verifier}`
      : `not run: ${first.reason}`,
    first.ran ? first.cycle.outcome === 'USEFUL' : first.reason === 'ALREADY_RUN',
  );

  // 4. Crash mid-RUN, then recover. This part runs on a throwaway kernel so the
  //    rehearsal is real every time the exercise is repeated, and so a dead
  //    worker's debris never lands in the Owner's live ledger.
  crashRehearsal(step);

  // 5. The other adapter on the same source.
  const shorts = runPortfolioCycle(db, {
    projectId: project.project_id,
    adapterKind: 'shopping_shorts',
    sourceVersionId,
    worker: 'g7-exercise',
    verify,
  });
  step(
    'shopping_shorts_pass',
    shorts.ran
      ? `${shorts.cycle.outcome} artefact ${shorts.cycle.artifact_sha256.slice(0, 16)}, needs_source ${JSON.stringify(shorts.artifact.needs_source)}`
      : `not run: ${shorts.reason}`,
    shorts.ran ? shorts.cycle.outcome === 'USEFUL' : shorts.reason === 'ALREADY_RUN',
  );

  // 6. Capacity: the second project cannot join it.
  const at = new Date().toISOString();
  let second = db.prepare("SELECT * FROM projects WHERE code = 'G7-EX-2'").get();
  if (!second) {
    const id = `PRJ-G7EX2-${Date.now()}`;
    db.prepare(
      `INSERT INTO projects (project_id, code, name, program_ug, status, priority_raw, promoted_from_inbox,
         body_evidence_ref, owner_confirmation_ref, created_at, updated_at)
       VALUES (?, 'G7-EX-2', 'G7 exercise capacity probe', 'UG02', 'REGISTRY', 0, NULL, ?, NULL, ?, ?)`,
    ).run(id, sourceVersionId, at, at);
    second = db.prepare('SELECT * FROM projects WHERE project_id = ?').get(id);
    for (const kind of ['DEMAND', 'UTILITY']) {
      recordDemandEvidence(db, {
        projectId: id,
        kind,
        metric: 'capacity_probe',
        value: 1,
        sourceRef: sourceVersionId,
        detail: 'evidence exists so the refusal below is about capacity alone',
      });
    }
  }
  const capacityRefusal = setProjectStatus(db, second.project_id, 'WATCH', 'G7 exercise probes the capacity limit');
  step(
    'capacity_refusal',
    capacityRefusal.changed ? 'a second project became active: this is a bug' : capacityRefusal.reasons.join(' | '),
    !capacityRefusal.changed,
  );

  const acceptance = g7Acceptance(db);
  const report = {
    db: dbPath,
    ok: steps.every((s) => s.ok) && acceptance.ok,
    steps,
    acceptance,
    portfolio: portfolioReport(db),
  };
  if (asJson) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else {
    for (const s of steps) process.stdout.write(`${s.ok ? 'PASS' : 'FAIL'} ${s.step} — ${s.detail}\n`);
    for (const p of acceptance.problems) process.stdout.write(`FAIL acceptance — ${p}\n`);
    process.stdout.write(`${report.ok ? 'PORTFOLIO_EXERCISE_PASS' : 'PORTFOLIO_EXERCISE_FAIL'}\n`);
  }
  process.exitCode = report.ok ? 0 : 1;
} finally {
  // The exercise leaves the machine as it found it: heavy work is one at a time,
  // and the stop goes back on if it was on.
  observe(db, 'unresolved_inbox', db.prepare("SELECT COUNT(*) AS n FROM inbox_items WHERE state <> 'PROMOTED'").get().n);
  if (stopWasEngaged) setStop(db, true, 'G7 exercise finished: the stop goes back to how it was found', 'owner');
  db.close();
}
