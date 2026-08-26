// Operator surface for the governor: the Owner grants and revokes scoped
// approvals, inspects why something was denied, and records red-team probes.
// Nothing here relaxes an invariant — every write still passes the schema
// triggers, and a denial is stored before it is reported.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { newId, nowIso } from '../core/ids.mjs';
import { canonicalJson, sha256, sha256Json } from '../core/hash.mjs';
import { appendEvent } from '../core/events.mjs';
import { admit, scopeHash, stopEngaged } from '../core/governor.mjs';

// Owner Packet refs are repository-relative, like every other evidence ref.
const REPO = new URL('../..', import.meta.url).pathname;

export const BYPASS_CLASSES = [
  'RAW_SQL',
  'GOVERNOR_API',
  'APPROVAL_REPLAY',
  'APPROVAL_EXPIRY',
  'APPROVAL_PARTIAL_USE',
  'EMERGENCY_STOP',
  'BUDGET',
  'LEASE',
  'AX_METHOD',
  'EVIDENCE',
];

/**
 * Grant a one-shot scoped approval. The payload is hashed, never stored raw, so
 * a later request with a different payload cannot reuse this grant.
 */
export function grantApproval(
  db,
  {
    exactAction,
    target,
    payload = null,
    payloadHash = null,
    maxCostKrw = 0,
    expiresAt,
    maxUses = 1,
    rollbackPlan,
    grantedBy = 'owner',
    ownerPacketRef,
  },
  clock = Date,
) {
  if (!exactAction || !target) throw new Error('YENO_GOVERNOR: approval needs an exact action and a target');
  if (!rollbackPlan) throw new Error('YENO_GOVERNOR: approval needs a rollback plan');
  if (!expiresAt) throw new Error('YENO_GOVERNOR: approval needs an expiry');
  if (!ownerPacketRef) throw new Error('YENO_GOVERNOR: approval needs the Owner Packet that authorised it');
  if (!existsSync(join(REPO, ownerPacketRef))) {
    throw new Error(`YENO_GOVERNOR: Owner Packet ${ownerPacketRef} does not exist on disk`);
  }
  const hash = payloadHash ?? (payload === null ? sha256('') : sha256Json(payload));
  const spec = { exactAction, target, payloadHash: hash, maxCostKrw, expiresAt, maxUses };
  const scope = scopeHash(spec);
  const existing = db.prepare('SELECT approval_id FROM approvals WHERE scope_hash = ?').get(scope);
  // The same scope is the same grant: re-running the command must not silently
  // hand out extra uses.
  if (existing) return { approval_id: existing.approval_id, scope_hash: scope, reused: true };

  const approvalId = newId('APR');
  db.prepare(
    `INSERT INTO approvals (approval_id, scope_hash, exact_action, target, payload_hash, max_cost_krw,
       expires_at, max_uses, uses, rollback_plan, granted_by, created_at, owner_packet_ref)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
  ).run(
    approvalId,
    scope,
    exactAction,
    target,
    hash,
    maxCostKrw,
    expiresAt,
    maxUses,
    rollbackPlan,
    grantedBy,
    nowIso(clock),
    ownerPacketRef,
  );
  appendEvent(
    db,
    {
      type: 'governor.approval_granted',
      actor: grantedBy,
      authority: 'A0',
      payload: {
        approval_id: approvalId,
        exact_action: exactAction,
        target,
        max_cost_krw: maxCostKrw,
        max_uses: maxUses,
        owner_packet_ref: ownerPacketRef,
      },
    },
    clock,
  );
  return { approval_id: approvalId, scope_hash: scope, reused: false, payload_hash: hash };
}

export function revokeApproval(db, approvalId, reason, actor = 'owner', clock = Date) {
  const info = db.prepare('UPDATE approvals SET revoked = 1 WHERE approval_id = ? AND revoked = 0').run(approvalId);
  if (info.changes !== 1) throw new Error(`YENO_GOVERNOR: ${approvalId} is unknown or already revoked`);
  appendEvent(db, { type: 'governor.approval_revoked', actor, authority: 'A0', payload: { approval_id: approvalId, reason } }, clock);
  return { approval_id: approvalId, revoked: true, reason };
}

export function approvalList(db, clock = Date) {
  const at = nowIso(clock);
  return db
    .prepare(
      `SELECT approval_id, exact_action, target, max_cost_krw, expires_at, max_uses, uses, revoked, granted_by,
              owner_packet_ref
         FROM approvals ORDER BY created_at DESC`,
    )
    .all()
    .map((a) => ({
      ...a,
      usable: a.revoked === 0 && a.uses < a.max_uses && a.expires_at > at,
      state: a.revoked === 1 ? 'REVOKED' : a.expires_at <= at ? 'EXPIRED' : a.uses >= a.max_uses ? 'EXHAUSTED' : 'LIVE',
    }));
}

/**
 * Dry-run a request through the real admission order. This records an attempt
 * like any other, so an operator probing the governor leaves a trail too.
 */
export function admissionCheck(db, request, { clock = Date } = {}) {
  const result = admit(db, request, { clock });
  return {
    decision: result.decision,
    reason_code: result.reasonCode,
    attempt_id: result.attemptId,
    detail: result.detail,
    stop_engaged: stopEngaged(db),
  };
}

export function admissionReport(db, { limit = 20 } = {}) {
  return {
    generated_at: new Date().toISOString(),
    stop_engaged: stopEngaged(db),
    stop: db.prepare('SELECT engaged, reason, changed_at, changed_by FROM emergency_stop WHERE id = 1').get(),
    approvals: approvalList(db),
    budget: db.prepare('SELECT profile_id, monthly_limit_krw, spent_krw, active, owner_promoted FROM budget_profiles').all(),
    by_reason: db
      .prepare('SELECT decision, reason_code, COUNT(*) AS n FROM admission_attempts GROUP BY decision, reason_code ORDER BY n DESC')
      .all(),
    recent: db
      .prepare('SELECT ts, goal, authority, method_class, decision, reason_code FROM admission_attempts ORDER BY ts DESC LIMIT ?')
      .all(limit),
    leases: db.prepare('SELECT resource, holder, fencing_token, expires_at FROM write_leases').all(),
  };
}

export function recordRedteamProbe(db, { suiteRef, bypassClass, attack, outcome, detail, evidenceRef = null }, clock = Date) {
  if (!BYPASS_CLASSES.includes(bypassClass)) throw new Error(`YENO_GOVERNOR: unknown bypass class ${bypassClass}`);
  const probeId = newId('RT');
  db.prepare(
    `INSERT INTO redteam_probes (probe_id, suite_ref, ts, bypass_class, attack, outcome, detail, evidence_ref)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(probeId, suiteRef, nowIso(clock), bypassClass, attack, outcome, detail, evidenceRef);
  return probeId;
}

/** G3 acceptance, recomputed from the probe record rather than from a claim. */
export function g3Acceptance(db) {
  const row = db.prepare('SELECT * FROM v_g3_acceptance').get();
  const covered = db
    .prepare("SELECT DISTINCT bypass_class FROM redteam_probes WHERE outcome = 'REFUSED'")
    .all()
    .map((r) => r.bypass_class);
  const missing = BYPASS_CLASSES.filter((c) => !covered.includes(c));
  const problems = [];
  if (row.bypasses_allowed > 0) problems.push(`${row.bypasses_allowed} red-team attack(s) were not refused`);
  if (missing.length > 0) problems.push(`no refused probe for bypass class: ${missing.join(', ')}`);
  return { ...row, classes_covered: covered, classes_uncovered: missing, problems };
}

export function redteamProbes(db, { bypassClass = null } = {}) {
  const rows = bypassClass
    ? db.prepare('SELECT * FROM redteam_probes WHERE bypass_class = ? ORDER BY ts').all(bypassClass)
    : db.prepare('SELECT * FROM redteam_probes ORDER BY ts').all();
  return rows.map((r) => ({ ...r, detail: r.detail.length > 200 ? `${r.detail.slice(0, 200)}…` : r.detail }));
}

/** Stable fingerprint of a red-team run, for the evidence bundle. */
export function redteamFingerprint(probes) {
  return sha256(canonicalJson(probes.map((p) => [p.bypass_class, p.attack, p.outcome])));
}
