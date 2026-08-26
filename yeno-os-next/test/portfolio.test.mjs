// G7 PortfolioOps. Two properties are under test: one adapter can carry one
// real source through the whole loop with an independent check at the end, and
// the portfolio cannot grow past the Owner's machine or past measured demand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { freshDb } from './helpers.mjs';
import { openDb } from '../src/core/db.mjs';
import { setStop } from '../src/core/governor.mjs';
import { sha256Json } from '../src/core/hash.mjs';
import { ingest, registerParsers } from '../src/domain/intake.mjs';
import { observe } from '../src/domain/self.mjs';
import {
  ADAPTERS,
  findCycle,
  g7Acceptance,
  portfolioReport,
  recordDemandEvidence,
  registerAdapter,
  runPortfolioCycle,
  setProjectStatus,
} from '../src/domain/portfolio.mjs';
import { makeArtifactVerifier } from '../src/domain/portfolio-verifier.mjs';

const SOURCE = [
  '# a small source, used only by these tests',
  'the fare is 1500 KRW',
  'the office opens at 09:00',
  'parking is free for two hours',
].join('\n');

/** A kernel with the stop released, one project, and one ingested source. */
function kernel({ adapterKind = 'for_ai', enabled = true, text = SOURCE } = {}) {
  const ctx = freshDb();
  const { db } = ctx;
  setStop(db, false, 'portfolio tests', 'owner');
  registerParsers(db);
  const intake = ingest(db, {
    bytes: Buffer.from(text, 'utf8'),
    kind: 'FILE',
    originRef: 'test://portfolio/source.md',
    parserId: 'plain-file/v1',
  });
  assert.equal(intake.outcome, 'ACCEPTED');
  const at = new Date().toISOString();
  db.prepare(
    `INSERT INTO projects (project_id, code, name, program_ug, status, priority_raw, promoted_from_inbox,
       body_evidence_ref, owner_confirmation_ref, created_at, updated_at)
     VALUES ('PRJ-test', 'TEST-1', 'test project', 'UG02', 'REGISTRY', 0, NULL, 'test fixture', NULL, ?, ?)`,
  ).run(at, at);
  const adapter = registerAdapter(db, { projectId: 'PRJ-test', kind: adapterKind, enabled, note: 'test' });
  // Something in the internal state has to be asking for work.
  observe(db, 'unresolved_inbox', 144);
  return {
    ...ctx,
    sourceVersionId: intake.source_version_id,
    adapter,
    verify: makeArtifactVerifier({ dbPath: ctx.path, artifactDir: join(ctx.dir, 'artifacts') }),
  };
}

test('the For AI adapter produces source-backed candidates and verifies none of them itself', () => {
  const out = ADAPTERS.for_ai.derive(SOURCE, { sourceVersionId: 'SV-x' });
  assert.equal(out.claim_count, 3);
  assert.equal(out.verified_claims, 0);
  for (const claim of out.claims) {
    assert.equal(claim.source_ref, 'SV-x');
    assert.equal(claim.status, 'NEEDS_VERIFICATION');
    assert.ok(SOURCE.includes(claim.text));
  }
  // Deterministic: the same bytes always give the same artefact hash.
  assert.equal(sha256Json(out), sha256Json(ADAPTERS.for_ai.derive(SOURCE, { sourceVersionId: 'SV-x' })));
});

test('the ShoppingShorts adapter marks a missing section NEEDS_SOURCE instead of inventing it', () => {
  const out = ADAPTERS.shopping_shorts.derive('only one line of source', { sourceVersionId: 'SV-x' });
  assert.deepEqual(out.needs_source, ['BODY', 'CTA']);
  assert.equal(out.sections[0].text, 'only one line of source');
  assert.equal(out.sections[1].text, null);
  assert.equal(out.published, false);
});

test('one pass carries source→goal→RUN→verification→outcome→memory and records every link', () => {
  const ctx = kernel();
  try {
    const out = runPortfolioCycle(ctx.db, {
      projectId: 'PRJ-test',
      adapterKind: 'for_ai',
      sourceVersionId: ctx.sourceVersionId,
      verify: ctx.verify,
    });
    assert.equal(out.ran, true);
    const cycle = out.cycle;
    assert.equal(cycle.outcome, 'USEFUL');
    assert.equal(cycle.verified, 1);
    assert.equal(cycle.verifier, 'scripts/verify-portfolio-artifact.mjs');
    for (const link of ['source_version_id', 'goal_id', 'job_id', 'artifact_sha256', 'memory_id']) {
      assert.ok(cycle[link], `${link} is missing from the cycle`);
    }
    // The goal really went through a council that selected it.
    const goal = ctx.db.prepare('SELECT * FROM goals WHERE goal_id = ?').get(cycle.goal_id);
    assert.equal(goal.state, 'DONE');
    const verdict = ctx.db.prepare('SELECT * FROM council_verdicts WHERE verdict_id = ?').get(goal.verdict_id);
    assert.equal(verdict.decision, 'SELECT');
    assert.equal(verdict.constitution_ok, 1);
    // The RUN was a real durable job that finished, and its artefact is on record.
    const job = ctx.db.prepare('SELECT * FROM jobs WHERE job_id = ?').get(cycle.job_id);
    assert.equal(job.state, 'DONE');
    assert.equal(job.artifact_ref, cycle.artifact_sha256);
    assert.equal(
      ctx.db.prepare('SELECT COUNT(*) AS n FROM artifacts WHERE sha256 = ?').get(cycle.artifact_sha256).n,
      1,
    );
    // And the outcome is remembered.
    const memory = ctx.db.prepare('SELECT * FROM memory_items WHERE memory_id = ?').get(cycle.memory_id);
    assert.equal(memory.source_ref, cycle.artifact_sha256);
    // No external effect was claimed: the pass is local.
    assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM external_effects').get().n, 0);
  } finally {
    ctx.cleanup();
  }
});

test('replaying the same pass is the same row: one job, one cycle, one artefact', () => {
  const ctx = kernel();
  try {
    const args = {
      projectId: 'PRJ-test',
      adapterKind: 'for_ai',
      sourceVersionId: ctx.sourceVersionId,
      verify: ctx.verify,
    };
    const first = runPortfolioCycle(ctx.db, args);
    const second = runPortfolioCycle(ctx.db, args);
    assert.equal(second.ran, false);
    assert.equal(second.reason, 'ALREADY_RUN');
    assert.equal(second.cycle.cycle_id, first.cycle.cycle_id);
    assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM portfolio_cycles').get().n, 1);
    assert.equal(ctx.db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE queue = 'portfolio'").get().n, 1);
  } finally {
    ctx.cleanup();
  }
});

test('a pass survives a restart: reopening the file replays the same cycle, not a new one', () => {
  const ctx = kernel();
  try {
    const args = {
      projectId: 'PRJ-test',
      adapterKind: 'for_ai',
      sourceVersionId: ctx.sourceVersionId,
      verify: ctx.verify,
    };
    const first = runPortfolioCycle(ctx.db, args);
    ctx.db.close();

    const reopened = openDb(ctx.path);
    const cycle = findCycle(reopened, {
      projectId: 'PRJ-test',
      adapterId: ctx.adapter.adapter_id,
      sourceVersionId: ctx.sourceVersionId,
    });
    assert.equal(cycle.cycle_id, first.cycle.cycle_id);
    assert.equal(cycle.artifact_sha256, first.cycle.artifact_sha256);
    assert.equal(cycle.verified, 1);
    assert.equal(g7Acceptance(reopened).ok, true);
    // And the loop is still closed against a *new* process's view of the file.
    const again = runPortfolioCycle(reopened, args);
    assert.equal(again.reason, 'ALREADY_RUN');
    assert.equal(reopened.prepare('SELECT COUNT(*) AS n FROM portfolio_cycles').get().n, 1);
    reopened.close();
  } finally {
    ctx.cleanup();
  }
});

test('a disabled adapter and an engaged stop both refuse to run a pass', () => {
  const ctx = kernel({ enabled: false });
  try {
    const args = {
      projectId: 'PRJ-test',
      adapterKind: 'for_ai',
      sourceVersionId: ctx.sourceVersionId,
      verify: ctx.verify,
    };
    assert.equal(runPortfolioCycle(ctx.db, args).reason, 'ADAPTER_DISABLED');
    ctx.db.prepare("UPDATE project_adapters SET enabled = 1 WHERE project_id = 'PRJ-test'").run();
    setStop(ctx.db, true, 'portfolio test engages the stop', 'owner');
    assert.equal(runPortfolioCycle(ctx.db, args).reason, 'EMERGENCY_STOP');
    assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM portfolio_cycles').get().n, 0);
  } finally {
    ctx.cleanup();
  }
});

test('a rejected artefact is recorded NOT_USEFUL, and the adapter may not verify itself', () => {
  const ctx = kernel();
  try {
    // A verifier that refuses: the pass is still recorded, honestly.
    const out = runPortfolioCycle(ctx.db, {
      projectId: 'PRJ-test',
      adapterKind: 'for_ai',
      sourceVersionId: ctx.sourceVersionId,
      verify: () => ({ ok: false, verifier: 'test-verifier', detail: 'refused on purpose' }),
    });
    assert.equal(out.cycle.outcome, 'NOT_USEFUL');
    assert.equal(out.cycle.verified, 0);

    // A verifier that is the adapter is refused outright. A second source is
    // used so the refusal is about the verifier, not about the replay guard.
    const other = ingest(ctx.db, {
      bytes: Buffer.from('a second source line\nand another', 'utf8'),
      kind: 'FILE',
      originRef: 'test://portfolio/second.md',
      parserId: 'plain-file/v1',
    });
    assert.throws(
      () =>
        runPortfolioCycle(ctx.db, {
          projectId: 'PRJ-test',
          adapterKind: 'for_ai',
          sourceVersionId: other.source_version_id,
          verify: () => ({ ok: true, verifier: 'for_ai' }),
        }),
      /must not be the adapter/,
    );
    // And a missing verifier is refused before anything runs.
    assert.throws(
      () => runPortfolioCycle(ctx.db, { projectId: 'PRJ-test', adapterKind: 'for_ai', sourceVersionId: 'SV-x' }),
      /needs an independent verifier/,
    );
  } finally {
    ctx.cleanup();
  }
});

test('the independent verifier rejects a hand-edited artefact and an invented claim', () => {
  const ctx = kernel();
  try {
    const out = runPortfolioCycle(ctx.db, {
      projectId: 'PRJ-test',
      adapterKind: 'for_ai',
      sourceVersionId: ctx.sourceVersionId,
      verify: ctx.verify,
    });
    const file = join(ctx.dir, 'artifacts', `for_ai-${out.artifact_sha256.slice(0, 16)}.json`);
    const artifact = JSON.parse(readFileSync(file, 'utf8'));
    artifact.claims[0].text = 'the fare is 100 KRW';
    const forged = join(ctx.dir, 'forged.json');
    writeFileSync(forged, JSON.stringify(artifact));
    const rejected = ctx.verify({
      artifactJson: JSON.stringify(artifact),
      artifactHash: out.artifact_sha256,
      sourceVersionId: ctx.sourceVersionId,
      adapterKind: 'for_ai',
    });
    assert.equal(rejected.ok, false);
    assert.match(rejected.detail, /hash|does not come from the source/);
  } finally {
    ctx.cleanup();
  }
});

test('a cycle cannot be recorded USEFUL without the whole loop, and cycles are append-only', () => {
  const ctx = kernel();
  try {
    const { db } = ctx;
    const adapterId = ctx.adapter.adapter_id;
    assert.throws(
      () =>
        db
          .prepare(
            `INSERT INTO portfolio_cycles (cycle_id, project_id, adapter_id, source_version_id, goal_id, job_id,
               artifact_sha256, verifier, verified, verification_ref, outcome, memory_id, detail, recorded_at)
             VALUES ('PCY-lie','PRJ-test',?,?,NULL,NULL,'deadbeef','someone',1,'ok','USEFUL',NULL,'','2026-08-26T00:00:00Z')`,
          )
          .run(adapterId, ctx.sourceVersionId),
      /YENO_SAFETY/,
    );
    const out = runPortfolioCycle(ctx.db, {
      projectId: 'PRJ-test',
      adapterKind: 'for_ai',
      sourceVersionId: ctx.sourceVersionId,
      verify: ctx.verify,
    });
    assert.throws(() => db.prepare("UPDATE portfolio_cycles SET outcome = 'USEFUL'").run(), /append-only/);
    assert.throws(() => db.prepare('DELETE FROM portfolio_cycles').run(), /cannot be deleted/);
    assert.ok(findCycle(db, { projectId: 'PRJ-test', adapterId, sourceVersionId: ctx.sourceVersionId }));
    assert.equal(out.cycle.cycle_id.startsWith('PCY'), true);
  } finally {
    ctx.cleanup();
  }
});

test('no scale without demand: activation needs measured demand and utility, in the API and in raw SQL', () => {
  const ctx = kernel();
  try {
    const { db } = ctx;
    const refused = setProjectStatus(db, 'PRJ-test', 'BUILD', 'owner wants to try');
    assert.equal(refused.changed, false);
    assert.equal(refused.reasons.length, 2);
    assert.throws(() => db.prepare("UPDATE projects SET status = 'BUILD' WHERE project_id = 'PRJ-test'").run(), /YENO_SAFETY/);

    // Evidence needs a source, and it cannot be edited later.
    assert.throws(
      () => recordDemandEvidence(db, { projectId: 'PRJ-test', kind: 'DEMAND', metric: 'weekly_uses', value: 5, sourceRef: '' }),
      /CHECK|constraint/,
    );
    recordDemandEvidence(db, {
      projectId: 'PRJ-test',
      kind: 'DEMAND',
      metric: 'weekly_uses',
      value: 5,
      sourceRef: 'test fixture ledger',
    });
    // Demand alone is still not enough.
    assert.equal(setProjectStatus(db, 'PRJ-test', 'BUILD', 'demand only').changed, false);
    recordDemandEvidence(db, {
      projectId: 'PRJ-test',
      kind: 'UTILITY',
      metric: 'minutes_saved',
      value: 20,
      sourceRef: 'test fixture ledger',
    });
    assert.equal(setProjectStatus(db, 'PRJ-test', 'BUILD', 'demand and utility on record').changed, true);
    assert.throws(() => db.prepare('UPDATE demand_evidence SET value = 500').run(), /append-only/);
    assert.throws(() => db.prepare('DELETE FROM demand_evidence').run(), /cannot be deleted/);
  } finally {
    ctx.cleanup();
  }
});

test('capacity is a hard limit: the second project cannot become active', () => {
  const ctx = kernel();
  try {
    const { db } = ctx;
    const at = new Date().toISOString();
    for (const id of ['PRJ-test', 'PRJ-two']) {
      if (id === 'PRJ-two') {
        db.prepare(
          `INSERT INTO projects (project_id, code, name, program_ug, status, priority_raw, promoted_from_inbox,
             body_evidence_ref, owner_confirmation_ref, created_at, updated_at)
           VALUES ('PRJ-two','TEST-2','second test project','UG02','REGISTRY',0,NULL,'test fixture',NULL,?,?)`,
        ).run(at, at);
      }
      for (const kind of ['DEMAND', 'UTILITY']) {
        recordDemandEvidence(db, { projectId: id, kind, metric: 'm', value: 1, sourceRef: 'test fixture ledger' });
      }
    }
    assert.equal(setProjectStatus(db, 'PRJ-test', 'BUILD', 'first active project').changed, true);
    const second = setProjectStatus(db, 'PRJ-two', 'WATCH', 'owner wants both');
    assert.equal(second.changed, false);
    assert.match(second.reasons.join(' '), /capacity is full/);
    assert.throws(() => db.prepare("UPDATE projects SET status = 'WATCH' WHERE project_id = 'PRJ-two'").run(), /capacity is full/);
    assert.equal(portfolioReport(db).active.length, 1);
    // Parking the first one frees the slot; nothing is deleted.
    assert.equal(setProjectStatus(db, 'PRJ-test', 'REGISTRY', 'parked, not deleted').changed, true);
    assert.equal(setProjectStatus(db, 'PRJ-two', 'WATCH', 'slot is free now').changed, true);
  } finally {
    ctx.cleanup();
  }
});

test('G7 acceptance reports the gap until an adapter has a verified pass', () => {
  const ctx = kernel({ adapterKind: 'shopping_shorts' });
  try {
    const before = g7Acceptance(ctx.db);
    assert.equal(before.ok, false);
    assert.deepEqual(before.adapters_awaiting_a_source, ['shopping_shorts']);
    runPortfolioCycle(ctx.db, {
      projectId: 'PRJ-test',
      adapterKind: 'shopping_shorts',
      sourceVersionId: ctx.sourceVersionId,
      verify: ctx.verify,
    });
    const after = g7Acceptance(ctx.db);
    assert.deepEqual(after.problems, []);
    assert.equal(after.ok, true);
    assert.deepEqual(after.adapters_with_a_verified_pass, ['shopping_shorts']);
    assert.equal(after.max_active, 1);
  } finally {
    ctx.cleanup();
  }
});
