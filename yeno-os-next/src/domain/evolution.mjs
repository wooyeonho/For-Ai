// G9 Evolution Lab — bounded self-change, proposal-only.
//
// This is the module where YENO is allowed to want to change itself, and it is
// deliberately the weakest module in the kernel: it can write a proposal, store
// the patch bytes in the vault, and measure them. It cannot approve, merge,
// deploy or apply anything. There is no apply path here at all — `applyApproved`
// exists only to refuse and to say who would have to build it.
//
// The refusals that matter are in 0018, not here:
//   * a proposal is born PROPOSED, unapproved, unapplied;
//   * the safety layer (migrations, governor, event chain, validators, the
//     contract) is not a legal target;
//   * BENCHMARKED needs measurements of these exact bytes, one improvement and
//     no regression;
//   * APPROVED needs a live Owner approval whose scope hash *is* the diff hash,
//     citing an Owner Packet on disk;
//   * the patch is immutable once proposed, so editing it after approval loses
//     the approval instead of inheriting it.
//
// So a bug in this file cannot widen what a self-change is allowed to do.
import { appendEvent } from '../core/events.mjs';
import { sha256 } from '../core/hash.mjs';
import { newId, nowIso } from '../core/ids.mjs';
import { stopEngaged } from '../core/governor.mjs';

export const RISKS = ['LOW', 'MEDIUM', 'HIGH'];

/** The leash, read from the database rather than from a constant in code. */
export function forbiddenTargets(db) {
  return db.prepare('SELECT * FROM evolution_forbidden_targets ORDER BY pattern').all();
}

function likeToRegExp(pattern) {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replace(/%/g, '.*').replace(/_/g, '.')}$`);
}

/**
 * Why a path may not be self-modified, or null if it may. Read-only, so the
 * shell and the CLI can explain the refusal before anyone writes a patch.
 */
export function targetRefusal(db, targetPath) {
  for (const row of forbiddenTargets(db)) {
    if (likeToRegExp(row.pattern).test(targetPath)) {
      return { pattern: row.pattern, reason: row.reason };
    }
  }
  return null;
}

function storePatch(db, patch, clock) {
  const bytes = Buffer.from(patch, 'utf8');
  const hash = sha256(bytes);
  const existing = db.prepare('SELECT sha256, size_bytes FROM blobs WHERE sha256 = ?').get(hash);
  if (!existing) {
    db.prepare('INSERT INTO blobs (sha256, size_bytes, bytes, created_at) VALUES (?, ?, ?, ?)').run(
      hash,
      bytes.length,
      bytes,
      nowIso(clock),
    );
  }
  return { hash, size: bytes.length };
}

/**
 * Propose a change to YENO itself. The patch bytes go to the content-addressed
 * vault first, and the row's `diff_sha256` is the hash of those bytes, which is
 * also the only scope an approval for this change can carry.
 *
 * Refusals are returned, not thrown, when they are the Owner's answer to a
 * legitimate question ("may I touch this file?"). Malformed input throws.
 */
export function proposeChange(
  db,
  { targetPath, patch, rationale, risk = 'LOW', blastRadius, rollbackPlan, origin = 'SELF', createdBy = 'yeno' },
  clock = Date,
) {
  if (!targetPath || !String(targetPath).trim()) throw new Error('YENO_EVOLUTION: a proposal needs a target path');
  if (typeof patch !== 'string' || patch.trim() === '') {
    throw new Error('YENO_EVOLUTION: a proposal needs the patch bytes it is proposing');
  }
  if (!rationale || !String(rationale).trim()) throw new Error('YENO_EVOLUTION: a proposal needs a rationale');
  if (!RISKS.includes(risk)) throw new Error(`YENO_EVOLUTION: unknown risk ${risk}`);
  if (!blastRadius || !String(blastRadius).trim()) {
    throw new Error('YENO_EVOLUTION: a proposal must state what it can break');
  }
  if (!rollbackPlan || !String(rollbackPlan).trim()) {
    throw new Error('YENO_EVOLUTION: a proposal must state how it is reversed');
  }

  const refusal = targetRefusal(db, targetPath);
  if (refusal) {
    appendEvent(
      db,
      {
        type: 'evolution.proposal_refused',
        actor: 'evolution',
        authority: 'A1',
        payload: { target_path: targetPath, pattern: refusal.pattern, reason: refusal.reason, origin },
      },
      clock,
    );
    return { proposed: false, reason: 'FORBIDDEN_TARGET', refusal };
  }

  const { hash, size } = storePatch(db, patch, clock);
  const already = db
    .prepare('SELECT * FROM change_proposals WHERE target_path = ? AND diff_sha256 = ?')
    .get(targetPath, hash);
  if (already) return { proposed: false, reason: 'ALREADY_PROPOSED', proposal: already };

  const id = newId('PRP');
  const at = nowIso(clock);
  db.prepare(
    `INSERT INTO change_proposals
       (proposal_id, origin, target_path, diff_sha256, diff_bytes, patch_ref, rationale, risk,
        blast_radius, rollback_plan, state, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PROPOSED', ?, ?)`,
  ).run(id, origin, targetPath, hash, size, `blob:${hash}`, rationale, risk, blastRadius, rollbackPlan, createdBy, at);
  appendEvent(
    db,
    {
      type: 'evolution.proposed',
      actor: 'evolution',
      authority: 'A1',
      payload: { proposal_id: id, origin, target_path: targetPath, diff_sha256: hash, risk },
    },
    clock,
  );
  return { proposed: true, proposal: db.prepare('SELECT * FROM change_proposals WHERE proposal_id = ?').get(id) };
}

/** The proposed bytes, re-checked against their hash before anyone reads them. */
export function patchBytes(db, proposalId) {
  const row = db
    .prepare(
      `SELECT p.diff_sha256, b.bytes FROM change_proposals p
         JOIN blobs b ON b.sha256 = p.diff_sha256
        WHERE p.proposal_id = ?`,
    )
    .get(proposalId);
  if (!row) throw new Error(`YENO_EVOLUTION: no stored patch for ${proposalId}`);
  const bytes = Buffer.from(row.bytes);
  if (sha256(bytes) !== row.diff_sha256) {
    throw new Error(`YENO_EVOLUTION: vault bytes for ${proposalId} do not match their hash`);
  }
  return bytes;
}

/**
 * File one measurement. The verdict is *derived from the numbers*, never taken
 * from the caller, so a measurer cannot report an improvement it did not get.
 * `ok: false` means the suite itself failed to run.
 */
export function recordBenchmark(
  db,
  { proposalId, suite, metric, baseline, candidate, higherIsBetter = true, measuredBy, evidenceRef, ok = true },
  clock = Date,
) {
  const proposal = db.prepare('SELECT * FROM change_proposals WHERE proposal_id = ?').get(proposalId);
  if (!proposal) throw new Error(`YENO_EVOLUTION: unknown proposal ${proposalId}`);
  if (!measuredBy) throw new Error('YENO_EVOLUTION: a benchmark must say who measured it');
  if (!evidenceRef) throw new Error('YENO_EVOLUTION: a benchmark must cite where its output is');
  if (!Number.isFinite(baseline) || !Number.isFinite(candidate)) {
    throw new Error('YENO_EVOLUTION: a benchmark needs two finite numbers');
  }
  const improved = higherIsBetter ? candidate > baseline : candidate < baseline;
  const verdict = ok === false ? 'FAIL' : improved ? 'PASS' : 'REGRESSION';
  const id = newId('BMK');
  db.prepare(
    `INSERT INTO proposal_benchmarks
       (benchmark_id, proposal_id, diff_sha256, suite, metric, baseline, candidate, higher_is_better,
        verdict, measured_by, evidence_ref, measured_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    proposalId,
    proposal.diff_sha256,
    suite,
    metric,
    baseline,
    candidate,
    higherIsBetter ? 1 : 0,
    verdict,
    measuredBy,
    evidenceRef,
    nowIso(clock),
  );
  appendEvent(
    db,
    {
      type: 'evolution.benchmarked',
      actor: 'evolution',
      authority: 'A2',
      payload: { benchmark_id: id, proposal_id: proposalId, suite, metric, baseline, candidate, verdict },
    },
    clock,
  );
  return db.prepare('SELECT * FROM proposal_benchmarks WHERE benchmark_id = ?').get(id);
}

export function benchmarkSummary(db, proposalId) {
  return db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN verdict = 'PASS' THEN 1 ELSE 0 END) AS improved,
         SUM(CASE WHEN verdict IN ('REGRESSION','FAIL') THEN 1 ELSE 0 END) AS regressed
       FROM proposal_benchmarks b
       JOIN change_proposals p ON p.proposal_id = b.proposal_id AND p.diff_sha256 = b.diff_sha256
       WHERE b.proposal_id = ?`,
    )
    .get(proposalId);
}

/** PROPOSED -> BENCHMARKED. Refused with a reason when the numbers do not say so. */
export function markBenchmarked(db, proposalId, clock = Date) {
  const proposal = db.prepare('SELECT * FROM change_proposals WHERE proposal_id = ?').get(proposalId);
  if (!proposal) throw new Error(`YENO_EVOLUTION: unknown proposal ${proposalId}`);
  if (proposal.state !== 'PROPOSED') return { moved: false, reason: 'NOT_PROPOSED', state: proposal.state };
  const summary = benchmarkSummary(db, proposalId);
  if ((summary.regressed ?? 0) > 0) return { moved: false, reason: 'REGRESSION_PRESENT', summary };
  if ((summary.improved ?? 0) === 0) return { moved: false, reason: 'NO_MEASURED_IMPROVEMENT', summary };
  db.prepare('UPDATE change_proposals SET state = ? WHERE proposal_id = ?').run('BENCHMARKED', proposalId);
  appendEvent(
    db,
    {
      type: 'evolution.state_changed',
      actor: 'evolution',
      authority: 'A2',
      payload: { proposal_id: proposalId, from: 'PROPOSED', to: 'BENCHMARKED', ...summary },
    },
    clock,
  );
  return { moved: true, state: 'BENCHMARKED', summary };
}

/**
 * BENCHMARKED -> APPROVED. This function does not grant anything: the approval
 * must already exist, scoped to this diff hash, and the trigger checks it again.
 */
export function approveProposal(db, { proposalId, approvalId, note = '' }, clock = Date) {
  const proposal = db.prepare('SELECT * FROM change_proposals WHERE proposal_id = ?').get(proposalId);
  if (!proposal) throw new Error(`YENO_EVOLUTION: unknown proposal ${proposalId}`);
  if (proposal.state !== 'BENCHMARKED') return { approved: false, reason: 'NOT_BENCHMARKED', state: proposal.state };
  const approval = db.prepare('SELECT * FROM approvals WHERE approval_id = ?').get(approvalId);
  if (!approval) return { approved: false, reason: 'NO_SUCH_APPROVAL' };
  if (approval.payload_hash !== proposal.diff_sha256) {
    return { approved: false, reason: 'APPROVAL_IS_NOT_BOUND_TO_THIS_DIFF' };
  }
  if (approval.exact_action !== 'evolution.apply' || approval.target !== proposal.target_path) {
    return { approved: false, reason: 'APPROVAL_IS_FOR_ANOTHER_ACTION' };
  }
  if (approval.revoked === 1) return { approved: false, reason: 'APPROVAL_REVOKED' };
  if (approval.uses >= approval.max_uses) return { approved: false, reason: 'APPROVAL_EXHAUSTED' };
  if (!approval.owner_packet_ref || approval.owner_packet_ref.trim() === '') {
    return { approved: false, reason: 'APPROVAL_HAS_NO_OWNER_PACKET' };
  }
  db.prepare(
    'UPDATE change_proposals SET state = ?, approval_id = ?, decision_note = ?, decided_at = ? WHERE proposal_id = ?',
  ).run('APPROVED', approvalId, note, nowIso(clock), proposalId);
  appendEvent(
    db,
    {
      type: 'evolution.approved',
      actor: 'owner',
      authority: 'A3',
      payload: { proposal_id: proposalId, approval_id: approvalId, diff_sha256: proposal.diff_sha256 },
    },
    clock,
  );
  return { approved: true, state: 'APPROVED' };
}

export function rejectProposal(db, { proposalId, note }, clock = Date) {
  if (!note || !String(note).trim()) throw new Error('YENO_EVOLUTION: rejecting a proposal needs a reason');
  const proposal = db.prepare('SELECT * FROM change_proposals WHERE proposal_id = ?').get(proposalId);
  if (!proposal) throw new Error(`YENO_EVOLUTION: unknown proposal ${proposalId}`);
  if (!['PROPOSED', 'BENCHMARKED', 'APPROVED'].includes(proposal.state)) {
    return { rejected: false, reason: 'NOT_OPEN', state: proposal.state };
  }
  db.prepare('UPDATE change_proposals SET state = ?, decision_note = ?, decided_at = ? WHERE proposal_id = ?').run(
    'REJECTED',
    note,
    nowIso(clock),
    proposalId,
  );
  appendEvent(
    db,
    {
      type: 'evolution.rejected',
      actor: 'owner',
      authority: 'A2',
      payload: { proposal_id: proposalId, from: proposal.state, note },
    },
    clock,
  );
  return { rejected: true, state: 'REJECTED' };
}

/**
 * There is no apply path, on purpose. G9 is proposal-only: writing an approved
 * patch into the working tree is an external effect on the machine YENO runs on,
 * and it needs a sandbox and a canary that do not exist yet. This function
 * exists so the refusal is a returned value with a reason instead of a missing
 * feature someone might add casually.
 */
export function applyApproved(db, proposalId) {
  const proposal = db.prepare('SELECT * FROM change_proposals WHERE proposal_id = ?').get(proposalId);
  if (!proposal) throw new Error(`YENO_EVOLUTION: unknown proposal ${proposalId}`);
  return {
    applied: false,
    reason: 'APPLY_PATH_NOT_BUILT',
    detail:
      'G9 is proposal-only: an approved patch is applied by the Owner, outside YENO. ' +
      'A self-apply path needs a sandbox, a canary and an automatic rollback first, and those are not built.',
    stop_engaged: stopEngaged(db),
    state: proposal.state,
  };
}

export function lab(db, { limit = 50 } = {}) {
  return db.prepare('SELECT * FROM v_evolution_lab ORDER BY created_at DESC, proposal_id LIMIT ?').all(limit);
}
