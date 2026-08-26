import { canonicalJson, sha256Json } from './hash.mjs';
import { newId, nowIso } from './ids.mjs';
import { appendEvent } from './events.mjs';

export const AX_PATTERNS = [
  'secret_exfiltration',
  'bypass_safety',
  'impersonation',
  'forge_approval',
  'covert_chat_manipulation',
  'tos_or_captcha_bypass',
  'evidence_tampering',
  'consciousness_claim',
];

const AUTHORITY_ORDER = ['A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6'];

export function scopeHash({ exactAction, target, payloadHash, maxCostKrw, expiresAt, maxUses }) {
  return sha256Json({
    exact_action: exactAction,
    target,
    payload_hash: payloadHash,
    max_cost_krw: maxCostKrw,
    expires_at: expiresAt,
    max_uses: maxUses,
  });
}

export function stopEngaged(db) {
  return db.prepare('SELECT engaged FROM emergency_stop WHERE id = 1').get().engaged === 1;
}

export function setStop(db, engaged, reason, actor, clock = Date) {
  db.prepare('UPDATE emergency_stop SET engaged = ?, reason = ?, changed_at = ?, changed_by = ? WHERE id = 1').run(
    engaged ? 1 : 0,
    reason,
    nowIso(clock),
    actor,
  );
  appendEvent(db, {
    type: engaged ? 'safety.stop_engaged' : 'safety.stop_released',
    actor,
    authority: 'A0',
    payload: { reason },
  }, clock);
  return stopEngaged(db);
}

function recordAttempt(db, request, decision, reasonCode, detail, runId, clock) {
  const attemptId = newId('ADM');
  db.prepare(
    `INSERT INTO admission_attempts (attempt_id, ts, goal, authority, method_class, decision, reason_code, detail_json, run_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    attemptId,
    nowIso(clock),
    request.goal,
    request.authority,
    request.methodClass,
    decision,
    reasonCode,
    canonicalJson(detail ?? {}),
    runId ?? null,
  );
  return { attemptId, decision, reasonCode, detail: detail ?? {} };
}

/**
 * Admission order is fixed and every refusal is recorded:
 * stop -> AX/method -> authority -> approval scope/expiry/uses -> cost gate ->
 * source confidence -> resource lock -> provider capability.
 */
export function admit(db, request, { clock = Date, now = null, providerCapabilities = new Set() } = {}) {
  const at = now ?? nowIso(clock);

  if (stopEngaged(db)) {
    return recordAttempt(db, request, 'DENY', 'EMERGENCY_STOP_ENGAGED', {}, null, clock);
  }

  if (request.methodClass === 'AX' || AX_PATTERNS.includes(request.method ?? '')) {
    return recordAttempt(db, request, 'DENY', 'AX_METHOD_FORBIDDEN', { method: request.method ?? null }, null, clock);
  }

  if (!AUTHORITY_ORDER.includes(request.authority)) {
    return recordAttempt(db, request, 'DENY', 'AUTHORITY_UNKNOWN', {}, null, clock);
  }

  const needsApproval = AUTHORITY_ORDER.indexOf(request.authority) >= AUTHORITY_ORDER.indexOf('A3');
  if (needsApproval) {
    if (!request.approvalId) {
      return recordAttempt(db, request, 'DENY', 'APPROVAL_REQUIRED', {}, null, clock);
    }
    const ap = db.prepare('SELECT * FROM approvals WHERE approval_id = ?').get(request.approvalId);
    if (!ap) return recordAttempt(db, request, 'DENY', 'APPROVAL_NOT_FOUND', {}, null, clock);
    if (ap.revoked === 1) return recordAttempt(db, request, 'DENY', 'APPROVAL_REVOKED', {}, null, clock);
    if (ap.expires_at <= at) {
      return recordAttempt(db, request, 'DENY', 'APPROVAL_EXPIRED', { expires_at: ap.expires_at }, null, clock);
    }
    if (ap.uses >= ap.max_uses) {
      return recordAttempt(db, request, 'DENY', 'APPROVAL_USES_EXHAUSTED', { uses: ap.uses }, null, clock);
    }
    const expected = scopeHash({
      exactAction: request.exactAction,
      target: request.target,
      payloadHash: request.payloadHash,
      maxCostKrw: ap.max_cost_krw,
      expiresAt: ap.expires_at,
      maxUses: ap.max_uses,
    });
    if (expected !== ap.scope_hash) {
      return recordAttempt(db, request, 'DENY', 'APPROVAL_SCOPE_MISMATCH', { expected, stored: ap.scope_hash }, null, clock);
    }
    if (request.costP90Krw != null && request.costP90Krw > ap.max_cost_krw) {
      return recordAttempt(db, request, 'DENY', 'APPROVAL_COST_CEILING', { max: ap.max_cost_krw }, null, clock);
    }
  }

  const profile = db.prepare('SELECT * FROM budget_profiles WHERE profile_id = ? AND active = 1').get(
    request.budgetProfileId,
  );
  if (!profile) {
    return recordAttempt(db, request, 'DENY', 'BUDGET_PROFILE_INACTIVE', { profile: request.budgetProfileId }, null, clock);
  }
  if (request.costP90Krw == null) {
    return recordAttempt(db, request, 'DENY', 'COST_P90_UNKNOWN', {}, null, clock);
  }
  const remaining = profile.monthly_limit_krw - profile.spent_krw;
  if (request.costP90Krw > remaining) {
    return recordAttempt(db, request, 'DENY', 'BUDGET_EXCEEDED', { remaining, requested: request.costP90Krw }, null, clock);
  }

  if (request.sourceVersionIds?.length) {
    const placeholders = request.sourceVersionIds.map(() => '?').join(',');
    const weak = db
      .prepare(`SELECT source_version_id, confidence FROM source_versions WHERE source_version_id IN (${placeholders})`)
      .all(...request.sourceVersionIds)
      .filter((r) => r.confidence === 'DISPUTED');
    const missing = request.sourceVersionIds.length
      - db.prepare(`SELECT COUNT(*) AS n FROM source_versions WHERE source_version_id IN (${placeholders})`)
        .all(...request.sourceVersionIds)[0].n;
    if (missing > 0 || weak.length > 0) {
      return recordAttempt(db, request, 'DENY', 'SOURCE_CONFIDENCE_INSUFFICIENT', { missing, weak }, null, clock);
    }
  }

  if (request.resource) {
    const lease = db.prepare('SELECT * FROM write_leases WHERE resource = ?').get(request.resource);
    if (lease && lease.holder !== '' && lease.expires_at > at && lease.holder !== request.actor) {
      return recordAttempt(db, request, 'DENY', 'RESOURCE_LEASE_HELD', { holder: lease.holder }, null, clock);
    }
  }

  if (request.requiredCapability && !providerCapabilities.has(request.requiredCapability)) {
    return recordAttempt(
      db,
      request,
      'DENY',
      'PROVIDER_CAPABILITY_MISSING',
      { required: request.requiredCapability },
      null,
      clock,
    );
  }

  return recordAttempt(db, request, 'ALLOW', 'ADMITTED', {}, null, clock);
}

export function consumeApproval(db, approvalId) {
  const info = db.prepare('UPDATE approvals SET uses = uses + 1 WHERE approval_id = ? AND uses < max_uses').run(
    approvalId,
  );
  if (info.changes !== 1) throw new Error('YENO_GOVERNOR: approval could not be consumed');
  return db.prepare('SELECT uses, max_uses FROM approvals WHERE approval_id = ?').get(approvalId);
}
