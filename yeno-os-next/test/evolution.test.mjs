// G9 Evolution Lab, proposal-only. The property under test is not "YENO can
// change itself" — it is that YENO *cannot*: it may propose and measure, and
// every step towards being applied needs someone else. Each test below is an
// attempt to skip a rung of the ladder, through the domain API and through raw
// SQL, because a refusal that only lives in JavaScript is not a refusal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, futureIso } from './helpers.mjs';
import { setStop } from '../src/core/governor.mjs';
import { sha256 } from '../src/core/hash.mjs';
import { grantApproval, revokeApproval } from '../src/domain/governance.mjs';
import {
  applyApproved,
  approveProposal,
  benchmarkSummary,
  forbiddenTargets,
  lab,
  markBenchmarked,
  patchBytes,
  proposeChange,
  recordBenchmark,
  rejectProposal,
  targetRefusal,
} from '../src/domain/evolution.mjs';

const PATCH = [
  '--- a/src/ui/render.mjs',
  '+++ b/src/ui/render.mjs',
  '@@',
  '-  const width = 24;',
  '+  const width = 28;',
].join('\n');

function propose(db, overrides = {}) {
  return proposeChange(db, {
    targetPath: 'src/ui/render.mjs',
    patch: PATCH,
    rationale: 'panel columns are truncated at 24 chars and the Owner cannot read project codes',
    risk: 'LOW',
    blastRadius: 'the text renderer only; no schema, no write path',
    rollbackPlan: 'revert the single constant',
    ...overrides,
  });
}

/** A proposal with one honest improvement measured on its exact bytes. */
function measured(db, overrides = {}) {
  const { proposal } = propose(db, overrides);
  recordBenchmark(db, {
    proposalId: proposal.proposal_id,
    suite: 'render',
    metric: 'truncated_cells',
    baseline: 12,
    candidate: 3,
    higherIsBetter: false,
    measuredBy: 'node --test',
    evidenceRef: 'evidence/RUN-019.md',
  });
  return proposal;
}

/** The Owner grant that binds consent to these exact bytes. */
function ownerApproval(db, { diff, target = 'src/ui/render.mjs' }) {
  return grantApproval(db, {
    exactAction: 'evolution.apply',
    target,
    payloadHash: diff,
    expiresAt: futureIso(),
    rollbackPlan: 'revert the commit',
    ownerPacketRef: 'evidence/OWNER-PACKET-003.md',
  });
}

test('the safety layer is not a legal target, and the leash is read from the database', () => {
  const ctx = freshDb();
  try {
    const patterns = forbiddenTargets(ctx.db).map((r) => r.pattern);
    assert.ok(patterns.includes('migrations/%'));
    assert.ok(patterns.includes('scripts/independent-validation.mjs'));

    for (const target of [
      'migrations/0019_something.sql',
      'src/core/governor.mjs',
      'scripts/independent-validation.mjs',
      'scripts/red-team-api.mjs',
      'CLAUDE.md',
    ]) {
      assert.ok(targetRefusal(ctx.db, target), `${target} must be refused`);
      const result = propose(ctx.db, { targetPath: target });
      assert.equal(result.proposed, false);
      assert.equal(result.reason, 'FORBIDDEN_TARGET');
    }
    assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM change_proposals').get().n, 0);

    // and the schema refuses it even if this module is bypassed entirely
    assert.throws(
      () =>
        ctx.db
          .prepare(
            `INSERT INTO change_proposals (proposal_id, origin, target_path, diff_sha256, diff_bytes, patch_ref,
               rationale, risk, blast_radius, rollback_plan, created_by, created_at)
             VALUES ('PRP-raw','SELF','migrations/0019_x.sql', ?, 10, 'blob:x', 'r', 'LOW', 'b', 'r', 'yeno', '2026-08-26T00:00:00.000Z')`,
          )
          .run(sha256('x')),
      /not open to self-modification/,
    );
  } finally {
    ctx.cleanup();
  }
});

test('a proposal is born powerless and its identity cannot be edited afterwards', () => {
  const ctx = freshDb();
  try {
    const { proposed, proposal } = propose(ctx.db);
    assert.equal(proposed, true);
    assert.equal(proposal.state, 'PROPOSED');
    assert.equal(proposal.approval_id, null);
    assert.equal(proposal.applied_at, null);
    assert.equal(proposal.diff_sha256, sha256(Buffer.from(PATCH, 'utf8')));
    assert.equal(patchBytes(ctx.db, proposal.proposal_id).toString('utf8'), PATCH);

    // the same bytes for the same file are one proposal, never two
    assert.equal(propose(ctx.db).reason, 'ALREADY_PROPOSED');

    assert.throws(
      () =>
        ctx.db
          .prepare('UPDATE change_proposals SET diff_sha256 = ? WHERE proposal_id = ?')
          .run(sha256('other bytes'), proposal.proposal_id),
      /identity of a change proposal is immutable/,
    );
    assert.throws(
      () => ctx.db.prepare('DELETE FROM change_proposals WHERE proposal_id = ?').run(proposal.proposal_id),
      /never deleted/,
    );
    // born APPROVED is not a thing
    assert.throws(
      () =>
        ctx.db
          .prepare(
            `INSERT INTO change_proposals (proposal_id, origin, target_path, diff_sha256, diff_bytes, patch_ref,
               rationale, risk, blast_radius, rollback_plan, state, created_by, created_at)
             VALUES ('PRP-born','SELF','src/ui/x.mjs', ?, 10, 'blob:x', 'r', 'LOW', 'b', 'r', 'APPROVED', 'yeno', '2026-08-26T00:00:00.000Z')`,
          )
          .run(sha256('born approved')),
      /born PROPOSED/,
    );
  } finally {
    ctx.cleanup();
  }
});

test('a benchmark verdict is derived from its numbers and cannot contradict them', () => {
  const ctx = freshDb();
  try {
    const { proposal } = propose(ctx.db);
    const worse = recordBenchmark(ctx.db, {
      proposalId: proposal.proposal_id,
      suite: 'render',
      metric: 'truncated_cells',
      baseline: 12,
      candidate: 20,
      higherIsBetter: false,
      measuredBy: 'node --test',
      evidenceRef: 'evidence/RUN-019.md',
    });
    assert.equal(worse.verdict, 'REGRESSION');

    // a hand-written PASS on numbers that got worse is refused by the schema
    assert.throws(
      () =>
        ctx.db
          .prepare(
            `INSERT INTO proposal_benchmarks (benchmark_id, proposal_id, diff_sha256, suite, metric, baseline,
               candidate, higher_is_better, verdict, measured_by, evidence_ref, measured_at)
             VALUES ('BMK-lie', ?, ?, 'render', 'other_metric', 12, 20, 0, 'PASS', 'yeno', 'e', '2026-08-26T00:00:00.000Z')`,
          )
          .run(proposal.proposal_id, proposal.diff_sha256),
      /may not contradict the numbers/,
    );
    // a benchmark of other bytes cannot be filed under this proposal
    assert.throws(
      () =>
        ctx.db
          .prepare(
            `INSERT INTO proposal_benchmarks (benchmark_id, proposal_id, diff_sha256, suite, metric, baseline,
               candidate, higher_is_better, verdict, measured_by, evidence_ref, measured_at)
             VALUES ('BMK-other', ?, ?, 'render', 'm', 12, 3, 0, 'PASS', 'yeno', 'e', '2026-08-26T00:00:00.000Z')`,
          )
          .run(proposal.proposal_id, sha256('some other patch')),
      /exact bytes of the proposal/,
    );
    // and yesterday's number cannot be improved after the fact
    assert.throws(
      () =>
        ctx.db
          .prepare('UPDATE proposal_benchmarks SET candidate = 1, verdict = ? WHERE benchmark_id = ?')
          .run('PASS', worse.benchmark_id),
      /append-only/,
    );
    assert.throws(
      () => ctx.db.prepare('DELETE FROM proposal_benchmarks WHERE benchmark_id = ?').run(worse.benchmark_id),
      /cannot be deleted/,
    );

    const stuck = markBenchmarked(ctx.db, proposal.proposal_id);
    assert.equal(stuck.moved, false);
    assert.equal(stuck.reason, 'REGRESSION_PRESENT');
  } finally {
    ctx.cleanup();
  }
});

test('BENCHMARKED needs a measured improvement, in the schema as well as the code', () => {
  const ctx = freshDb();
  try {
    const { proposal } = propose(ctx.db);
    const unmeasured = markBenchmarked(ctx.db, proposal.proposal_id);
    assert.equal(unmeasured.moved, false);
    assert.equal(unmeasured.reason, 'NO_MEASURED_IMPROVEMENT');
    assert.throws(
      () =>
        ctx.db.prepare('UPDATE change_proposals SET state = ? WHERE proposal_id = ?').run(
          'BENCHMARKED',
          proposal.proposal_id,
        ),
      /measured improvement and no regression/,
    );

    recordBenchmark(ctx.db, {
      proposalId: proposal.proposal_id,
      suite: 'render',
      metric: 'truncated_cells',
      baseline: 12,
      candidate: 3,
      higherIsBetter: false,
      measuredBy: 'node --test',
      evidenceRef: 'evidence/RUN-019.md',
    });
    const summary = benchmarkSummary(ctx.db, proposal.proposal_id);
    assert.equal(summary.improved, 1);
    assert.equal(summary.regressed, 0);
    assert.equal(markBenchmarked(ctx.db, proposal.proposal_id).moved, true);
  } finally {
    ctx.cleanup();
  }
});

test('approval must be the Owner grant for these exact bytes, and cannot be skipped', () => {
  const ctx = freshDb();
  try {
    const proposal = measured(ctx.db);
    markBenchmarked(ctx.db, proposal.proposal_id);

    // no approval at all
    assert.equal(approveProposal(ctx.db, { proposalId: proposal.proposal_id, approvalId: 'APR-nope' }).reason,
      'NO_SUCH_APPROVAL');
    assert.throws(
      () =>
        ctx.db
          .prepare('UPDATE change_proposals SET state = ? WHERE proposal_id = ?')
          .run('APPROVED', proposal.proposal_id),
      /live Owner approval bound to its diff hash/,
    );

    // an approval for other bytes is not consent for these
    const elsewhere = ownerApproval(ctx.db, { diff: sha256('a different patch') });
    assert.equal(
      approveProposal(ctx.db, { proposalId: proposal.proposal_id, approvalId: elsewhere.approval_id }).reason,
      'APPROVAL_IS_NOT_BOUND_TO_THIS_DIFF',
    );

    // an approval for another action is not consent to change the code either
    const other = grantApproval(ctx.db, {
      exactAction: 'shopping_shorts.publish',
      target: 'src/ui/render.mjs',
      payloadHash: proposal.diff_sha256,
      expiresAt: futureIso(),
      rollbackPlan: 'delete the post',
      ownerPacketRef: 'evidence/OWNER-PACKET-003.md',
    });
    assert.equal(
      approveProposal(ctx.db, { proposalId: proposal.proposal_id, approvalId: other.approval_id }).reason,
      'APPROVAL_IS_FOR_ANOTHER_ACTION',
    );

    const grant = ownerApproval(ctx.db, { diff: proposal.diff_sha256 });
    const approved = approveProposal(ctx.db, {
      proposalId: proposal.proposal_id,
      approvalId: grant.approval_id,
      note: 'the Owner read the diff',
    });
    assert.equal(approved.approved, true);
    assert.equal(
      ctx.db.prepare('SELECT state FROM change_proposals WHERE proposal_id = ?').get(proposal.proposal_id).state,
      'APPROVED',
    );
  } finally {
    ctx.cleanup();
  }
});

test('there is no path from PROPOSED to APPLIED, and applying is not built', () => {
  const ctx = freshDb();
  try {
    const proposal = measured(ctx.db);
    // the ladder refuses every jump: straight to APPLIED, and straight to the
    // rollback state that only an applied change can reach
    assert.throws(
      () =>
        ctx.db
          .prepare('UPDATE change_proposals SET state = ?, applied_at = ? WHERE proposal_id = ?')
          .run('APPLIED', '2026-08-26T00:00:00.000Z', proposal.proposal_id),
      /YENO_SAFETY/,
    );
    assert.throws(
      () =>
        ctx.db
          .prepare('UPDATE change_proposals SET state = ?, rolled_back_at = ? WHERE proposal_id = ?')
          .run('ROLLED_BACK', '2026-08-26T00:00:00.000Z', proposal.proposal_id),
      /climb PROPOSED -> BENCHMARKED -> APPROVED -> APPLIED only/,
    );

    markBenchmarked(ctx.db, proposal.proposal_id);
    const grant = ownerApproval(ctx.db, { diff: proposal.diff_sha256 });
    approveProposal(ctx.db, { proposalId: proposal.proposal_id, approvalId: grant.approval_id });

    // approved, but the stop is engaged on a fresh kernel: applying is refused
    assert.throws(
      () =>
        ctx.db
          .prepare('UPDATE change_proposals SET state = ?, applied_at = ? WHERE proposal_id = ?')
          .run('APPLIED', '2026-08-26T00:00:00.000Z', proposal.proposal_id),
      /released stop, an unrevoked approval and an applied_at/,
    );

    setStop(ctx.db, false, 'evolution tests', 'owner');
    // stop released, but a revoked approval still cannot apply
    revokeApproval(ctx.db, grant.approval_id, 'the Owner changed their mind');
    assert.throws(
      () =>
        ctx.db
          .prepare('UPDATE change_proposals SET state = ?, applied_at = ? WHERE proposal_id = ?')
          .run('APPLIED', '2026-08-26T00:00:00.000Z', proposal.proposal_id),
      /released stop, an unrevoked approval and an applied_at/,
    );

    // and the module itself has no apply path to call
    const attempt = applyApproved(ctx.db, proposal.proposal_id);
    assert.equal(attempt.applied, false);
    assert.equal(attempt.reason, 'APPLY_PATH_NOT_BUILT');
  } finally {
    ctx.cleanup();
  }
});

test('the lab view says what blocks each proposal, and a rejection is final', () => {
  const ctx = freshDb();
  try {
    const { proposal } = propose(ctx.db);
    let row = lab(ctx.db).find((r) => r.proposal_id === proposal.proposal_id);
    assert.equal(row.state, 'PROPOSED');
    assert.equal(row.blocked_by, 'needs a measured improvement');
    assert.equal(row.benchmarks, 0);

    recordBenchmark(ctx.db, {
      proposalId: proposal.proposal_id,
      suite: 'render',
      metric: 'truncated_cells',
      baseline: 12,
      candidate: 3,
      higherIsBetter: false,
      measuredBy: 'node --test',
      evidenceRef: 'evidence/RUN-019.md',
    });
    markBenchmarked(ctx.db, proposal.proposal_id);
    row = lab(ctx.db).find((r) => r.proposal_id === proposal.proposal_id);
    assert.equal(row.blocked_by, 'needs an Owner approval bound to this diff hash');
    assert.equal(row.improved, 1);

    assert.throws(() => rejectProposal(ctx.db, { proposalId: proposal.proposal_id }), /needs a reason/);
    assert.equal(rejectProposal(ctx.db, { proposalId: proposal.proposal_id, note: 'not worth the risk' }).rejected, true);
    assert.equal(rejectProposal(ctx.db, { proposalId: proposal.proposal_id, note: 'again' }).reason, 'NOT_OPEN');
    row = lab(ctx.db).find((r) => r.proposal_id === proposal.proposal_id);
    assert.equal(row.state, 'REJECTED');
    assert.equal(row.blocked_by, 'closed');
  } finally {
    ctx.cleanup();
  }
});
