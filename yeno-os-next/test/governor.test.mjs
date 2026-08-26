import { test } from 'node:test';
import assert from 'node:assert/strict';
import { admit, consumeApproval, scopeHash, setStop, stopEngaged } from '../src/core/governor.mjs';
import { sha256Json } from '../src/core/hash.mjs';
import { freshDb, futureIso, pastIso } from './helpers.mjs';

function grantApproval(db, overrides = {}) {
  const spec = {
    exactAction: 'git.push',
    target: 'origin/main',
    payloadHash: sha256Json({ commit: 'abc' }),
    maxCostKrw: 0,
    expiresAt: futureIso(),
    maxUses: 1,
    ...overrides,
  };
  const approvalId = `APR-${sha256Json(spec).slice(0, 12)}`;
  db.prepare(
    `INSERT INTO approvals (approval_id, scope_hash, exact_action, target, payload_hash, max_cost_krw,
       expires_at, max_uses, uses, rollback_plan, granted_by, created_at, owner_packet_ref)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
  ).run(
    approvalId,
    scopeHash(spec),
    spec.exactAction,
    spec.target,
    spec.payloadHash,
    spec.maxCostKrw,
    spec.expiresAt,
    spec.maxUses,
    'git revert',
    'owner',
    new Date().toISOString(),
    'evidence/OWNER-PACKET-002.md',
  );
  return { approvalId, spec };
}

function baseRequest(overrides = {}) {
  return {
    goal: 'push the G0 bundle',
    authority: 'A2',
    methodClass: 'SAFE',
    budgetProfileId: 'BP-LOCAL',
    costP90Krw: 0,
    actor: 'builder',
    ...overrides,
  };
}

test('emergency stop is engaged by default and denies everything', () => {
  const { db, cleanup } = freshDb();
  try {
    assert.equal(stopEngaged(db), true);
    const result = admit(db, baseRequest());
    assert.equal(result.decision, 'DENY');
    assert.equal(result.reasonCode, 'EMERGENCY_STOP_ENGAGED');
  } finally {
    cleanup();
  }
});

test('every refusal is recorded as an admission attempt', () => {
  const { db, cleanup } = freshDb();
  try {
    admit(db, baseRequest());
    admit(db, baseRequest({ goal: 'second try' }));
    const rows = db.prepare("SELECT COUNT(*) AS n FROM admission_attempts WHERE decision = 'DENY'").get().n;
    assert.equal(rows, 2);
  } finally {
    cleanup();
  }
});

test('a safe local run is admitted after the Owner releases the stop', () => {
  const { db, cleanup } = freshDb();
  try {
    setStop(db, false, 'test', 'owner');
    const result = admit(db, baseRequest());
    assert.equal(result.decision, 'ALLOW');
    assert.equal(result.reasonCode, 'ADMITTED');
  } finally {
    cleanup();
  }
});

test('AX method class is denied even with a valid approval', () => {
  const { db, cleanup } = freshDb();
  try {
    setStop(db, false, 'test', 'owner');
    const { approvalId } = grantApproval(db);
    const result = admit(db, baseRequest({ methodClass: 'AX', authority: 'A3', approvalId }));
    assert.equal(result.reasonCode, 'AX_METHOD_FORBIDDEN');
  } finally {
    cleanup();
  }
});

test('an external-effect authority without approval is denied', () => {
  const { db, cleanup } = freshDb();
  try {
    setStop(db, false, 'test', 'owner');
    assert.equal(admit(db, baseRequest({ authority: 'A3' })).reasonCode, 'APPROVAL_REQUIRED');
  } finally {
    cleanup();
  }
});

test('expired, exhausted, revoked and mismatched approvals are all denied', () => {
  const { db, cleanup } = freshDb();
  try {
    setStop(db, false, 'test', 'owner');

    const expired = grantApproval(db, { expiresAt: pastIso(), target: 'origin/expired' });
    assert.equal(
      admit(db, baseRequest({ authority: 'A3', approvalId: expired.approvalId, ...toScope(expired) })).reasonCode,
      'APPROVAL_EXPIRED',
    );

    const used = grantApproval(db, { target: 'origin/used' });
    consumeApproval(db, used.approvalId);
    assert.equal(
      admit(db, baseRequest({ authority: 'A3', approvalId: used.approvalId, ...toScope(used) })).reasonCode,
      'APPROVAL_USES_EXHAUSTED',
    );

    const revoked = grantApproval(db, { target: 'origin/revoked' });
    db.prepare('UPDATE approvals SET revoked = 1 WHERE approval_id = ?').run(revoked.approvalId);
    assert.equal(
      admit(db, baseRequest({ authority: 'A3', approvalId: revoked.approvalId, ...toScope(revoked) })).reasonCode,
      'APPROVAL_REVOKED',
    );

    const good = grantApproval(db, { target: 'origin/good' });
    const drifted = admit(
      db,
      baseRequest({ authority: 'A3', approvalId: good.approvalId, ...toScope(good), target: 'origin/other' }),
    );
    assert.equal(drifted.reasonCode, 'APPROVAL_SCOPE_MISMATCH');

    const ok = admit(db, baseRequest({ authority: 'A3', approvalId: good.approvalId, ...toScope(good) }));
    assert.equal(ok.decision, 'ALLOW');
  } finally {
    cleanup();
  }
});

function toScope({ spec }) {
  return { exactAction: spec.exactAction, target: spec.target, payloadHash: spec.payloadHash };
}

test('consuming an approval twice is impossible', () => {
  const { db, cleanup } = freshDb();
  try {
    const { approvalId } = grantApproval(db);
    consumeApproval(db, approvalId);
    assert.throws(() => consumeApproval(db, approvalId), /could not be consumed/);
  } finally {
    cleanup();
  }
});

test('approval scope columns are immutable', () => {
  const { db, cleanup } = freshDb();
  try {
    const { approvalId } = grantApproval(db);
    assert.throws(
      () => db.prepare('UPDATE approvals SET target = ? WHERE approval_id = ?').run('origin/evil', approvalId),
      /approval scope is immutable/,
    );
  } finally {
    cleanup();
  }
});

test('unknown or over-budget cost is a hard gate', () => {
  const { db, cleanup } = freshDb();
  try {
    setStop(db, false, 'test', 'owner');
    assert.equal(admit(db, baseRequest({ costP90Krw: null })).reasonCode, 'COST_P90_UNKNOWN');
    assert.equal(admit(db, baseRequest({ costP90Krw: 400000 })).reasonCode, 'BUDGET_EXCEEDED');
    assert.equal(admit(db, baseRequest({ budgetProfileId: 'BP-SCALE' })).reasonCode, 'BUDGET_PROFILE_INACTIVE');
  } finally {
    cleanup();
  }
});

test('disputed or missing source confidence blocks admission', () => {
  const { db, cleanup } = freshDb();
  try {
    setStop(db, false, 'test', 'owner');
    assert.equal(
      admit(db, baseRequest({ sourceVersionIds: ['SV-missing'] })).reasonCode,
      'SOURCE_CONFIDENCE_INSUFFICIENT',
    );
  } finally {
    cleanup();
  }
});

test('a held lease and a missing provider capability are denials, not silent runs', () => {
  const { db, cleanup } = freshDb();
  try {
    setStop(db, false, 'test', 'owner');
    db.prepare(
      `INSERT INTO write_leases (resource, holder, fencing_token, acquired_at, expires_at)
       VALUES ('state/yeno.db', 'other-worker', 1, ?, ?)`,
    ).run(new Date().toISOString(), futureIso());
    assert.equal(admit(db, baseRequest({ resource: 'state/yeno.db' })).reasonCode, 'RESOURCE_LEASE_HELD');
    assert.equal(
      admit(db, baseRequest({ requiredCapability: 'claude_code.plan' })).reasonCode,
      'PROVIDER_CAPABILITY_MISSING',
    );
  } finally {
    cleanup();
  }
});

test('direct SQL cannot bypass the stop, cost or AX gates on runs', () => {
  const { db, cleanup } = freshDb();
  const insert = (extra = {}) => {
    const row = {
      run_id: `RUN-${Math.random()}`,
      goal: 'bypass attempt',
      authority: 'A2',
      method_class: 'SAFE',
      network: 'NONE',
      cost_p90_krw: 0,
      budget_profile_id: 'BP-LOCAL',
      baseline_ref: 'BASELINE-20260826',
      acceptance: 'none',
      rollback: 'none',
      state: 'PENDING',
      ...extra,
    };
    db.prepare(
      `INSERT INTO runs (run_id, goal, authority, method_class, network, cost_p90_krw, budget_profile_id,
         baseline_ref, acceptance, rollback, state, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      row.run_id, row.goal, row.authority, row.method_class, row.network, row.cost_p90_krw,
      row.budget_profile_id, row.baseline_ref, row.acceptance, row.rollback, row.state,
      new Date().toISOString(), new Date().toISOString(),
    );
  };
  try {
    assert.throws(() => insert(), /emergency stop engaged/);
    setStop(db, false, 'test', 'owner');
    assert.throws(() => insert({ cost_p90_krw: null }), /cost_p90 unknown/);
    assert.throws(() => insert({ cost_p90_krw: 999999 }), /exceeds remaining budget/);
    assert.throws(() => insert({ method_class: 'AX' }), /AX method class is never admissible/);
    insert();
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM runs').get().n, 1);
  } finally {
    cleanup();
  }
});

test('an unpromoted budget profile cannot be activated', () => {
  const { db, cleanup } = freshDb();
  try {
    assert.throws(
      () => db.exec("UPDATE budget_profiles SET active = 1 WHERE profile_id = 'BP-SCALE'"),
      /needs Owner promotion/,
    );
  } finally {
    cleanup();
  }
});

test('title-only promotion is refused and evidence-backed promotion succeeds', () => {
  const { db, cleanup } = freshDb();
  const now = new Date().toISOString();
  try {
    db.prepare(
      `INSERT INTO inbox_items (inbox_id, title, state, next_action, created_at, updated_at)
       VALUES ('IN-1', 'title only conversation', 'BODY_MISSING', 'await official export', ?, ?)`,
    ).run(now, now);
    const insertProject = (extra) =>
      db.prepare(
        `INSERT INTO projects (project_id, code, name, status, promoted_from_inbox, body_evidence_ref,
           owner_confirmation_ref, created_at, updated_at)
         VALUES (?, ?, ?, 'REGISTRY', 'IN-1', ?, ?, ?, ?)`,
      ).run(extra.id, extra.code, 'Promoted', extra.body ?? null, extra.owner ?? null, now, now);

    assert.throws(() => insertProject({ id: 'PRJ-1', code: 'TSP-001' }), /title-only promotion/);
    insertProject({ id: 'PRJ-2', code: 'TSP-002', owner: 'OWNER-CONFIRM-1' });
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM projects').get().n, 1);
  } finally {
    cleanup();
  }
});

test('emergency stop survives reopening the database file', async () => {
  const { db, path, cleanup } = freshDb();
  try {
    setStop(db, false, 'test', 'owner');
    assert.equal(stopEngaged(db), false);
    db.close();
    const { openDb } = await import('../src/core/db.mjs');
    const reopened = openDb(path);
    assert.equal(stopEngaged(reopened), false);
    setStop(reopened, true, 'shutdown', 'owner');
    reopened.close();
    const again = openDb(path);
    assert.equal(stopEngaged(again), true);
    again.close();
  } finally {
    cleanup();
  }
});
