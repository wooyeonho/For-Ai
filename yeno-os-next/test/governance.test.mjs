// G3 operator surface and schema guards. These tests are written against the
// refusals: a governor is only worth its acceptance if the denial happens even
// when the caller skips src/ and writes SQL directly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, fixedClock, futureIso, pastIso } from './helpers.mjs';
import { admit, consumeApproval, setStop } from '../src/core/governor.mjs';
import { acquireLease } from '../src/core/lease.mjs';
import {
  admissionCheck,
  admissionReport,
  approvalList,
  g3Acceptance,
  grantApproval,
  recordRedteamProbe,
  revokeApproval,
  BYPASS_CLASSES,
} from '../src/domain/governance.mjs';
import { promotionBlockers } from '../src/domain/gate.mjs';

const grantSpec = (over = {}) => ({
  exactAction: 'git.push',
  target: 'origin/devin/branch',
  payload: { commit: 'deadbeef' },
  maxCostKrw: 1000,
  expiresAt: futureIso(),
  maxUses: 1,
  rollbackPlan: 'git revert',
  ownerPacketRef: 'evidence/OWNER-PACKET-002.md',
  ...over,
});

function opened() {
  const ctx = freshDb();
  setStop(ctx.db, false, 'test', 'owner');
  return ctx;
}

test('the same approval scope is one grant, not a fresh set of uses', () => {
  const { db, cleanup } = opened();
  try {
    const spec = grantSpec();
    const first = grantApproval(db, spec, fixedClock());
    const second = grantApproval(db, spec, fixedClock());
    assert.equal(second.approval_id, first.approval_id);
    assert.equal(second.reused, true);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM approvals').get().n, 1);
  } finally {
    cleanup();
  }
});

test('an approval reports LIVE, EXHAUSTED, EXPIRED and REVOKED honestly', () => {
  const { db, cleanup } = opened();
  try {
    const live = grantApproval(db, grantSpec());
    assert.equal(approvalList(db).find((a) => a.approval_id === live.approval_id).state, 'LIVE');

    consumeApproval(db, live.approval_id);
    assert.equal(approvalList(db).find((a) => a.approval_id === live.approval_id).state, 'EXHAUSTED');

    const expired = grantApproval(db, grantSpec({ target: 'origin/other', expiresAt: pastIso() }));
    assert.equal(approvalList(db).find((a) => a.approval_id === expired.approval_id).state, 'EXPIRED');

    const revoked = grantApproval(db, grantSpec({ target: 'origin/third' }));
    revokeApproval(db, revoked.approval_id, 'owner changed their mind');
    const row = approvalList(db).find((a) => a.approval_id === revoked.approval_id);
    assert.equal(row.state, 'REVOKED');
    assert.equal(row.usable, false);
  } finally {
    cleanup();
  }
});

test('revocation is final and cannot be undone by raw SQL', () => {
  const { db, cleanup } = opened();
  try {
    const { approval_id: id } = grantApproval(db, grantSpec());
    revokeApproval(db, id, 'stop');
    assert.throws(() => revokeApproval(db, id, 'again'), /unknown or already revoked/);
    assert.throws(
      () => db.prepare('UPDATE approvals SET revoked = 0 WHERE approval_id = ?').run(id),
      /cannot be un-revoked/,
    );
  } finally {
    cleanup();
  }
});

test('the approval use counter cannot be rewound and the record cannot be deleted', () => {
  const { db, cleanup } = opened();
  try {
    const { approval_id: id } = grantApproval(db, grantSpec());
    consumeApproval(db, id);
    assert.throws(() => db.prepare('UPDATE approvals SET uses = 0 WHERE approval_id = ?').run(id), /cannot be rewound/);
    assert.throws(() => db.prepare('DELETE FROM approvals WHERE approval_id = ?').run(id), /never deleted/);
  } finally {
    cleanup();
  }
});

test('a fresh install refuses every admission until the Owner releases the stop', () => {
  const { db, cleanup } = freshDb();
  try {
    const out = admissionCheck(db, { goal: 'anything', authority: 'A2', methodClass: 'SAFE', budgetProfileId: 'BP-LOCAL', costP90Krw: 0 });
    assert.equal(out.decision, 'DENY');
    assert.equal(out.reason_code, 'EMERGENCY_STOP_ENGAGED');
    assert.equal(out.stop_engaged, true);
    // The probe itself is recorded, so operators cannot query the governor invisibly.
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM admission_attempts').get().n, 1);
  } finally {
    cleanup();
  }
});

test('only the Owner releases the emergency stop, and never silently', () => {
  const { db, cleanup } = freshDb();
  try {
    assert.throws(
      () =>
        db
          .prepare("UPDATE emergency_stop SET engaged = 0, reason = 'pwned', changed_by = 'attacker' WHERE id = 1")
          .run(),
      /only the Owner releases/,
    );
    assert.throws(
      () => db.prepare("UPDATE emergency_stop SET engaged = 0, reason = '' , changed_by = 'owner' WHERE id = 1").run(),
      /only the Owner releases/,
    );
    assert.throws(() => db.prepare('DELETE FROM emergency_stop WHERE id = 1').run(), /permanent/);
    assert.equal(db.prepare('SELECT engaged FROM emergency_stop WHERE id = 1').get().engaged, 1);
  } finally {
    cleanup();
  }
});

test('an A3+ RUN cannot be inserted without a live in-scope approval', () => {
  const { db, cleanup } = opened();
  try {
    const insert = (over = {}) => {
      const row = {
        run_id: `RUN-${Math.random().toString(16).slice(2, 10)}`,
        goal: 'external effect',
        authority: 'A4',
        method_class: 'SAFE',
        network: 'ALLOWLIST',
        cost_p90_krw: 0,
        budget_profile_id: 'BP-LOCAL',
        approval_id: null,
        baseline_ref: 'BASELINE-20260826',
        acceptance: 'none',
        rollback: 'none',
        state: 'PENDING',
        created_at: new Date().toISOString(),
        ...over,
      };
      const cols = Object.keys(row);
      db.prepare(
        `INSERT INTO runs (${cols.join(',')}, updated_at) VALUES (${cols.map(() => '?').join(',')}, ?)`,
      ).run(...cols.map((c) => row[c]), row.created_at);
      return row.run_id;
    };

    assert.throws(() => insert(), /A3\+ RUN needs a live in-scope Owner approval/);

    const { approval_id: id } = grantApproval(db, grantSpec());
    const runId = insert({ authority: 'A3', approval_id: id });
    assert.equal(db.prepare('SELECT authority FROM runs WHERE run_id = ?').get(runId).authority, 'A3');
    // Authority is fixed at admission, so a RUN cannot grow privileges later.
    assert.throws(
      () => db.prepare("UPDATE runs SET authority = 'A5' WHERE run_id = ?").run(runId),
      /authority is fixed/,
    );

    revokeApproval(db, id, 'revoked after the fact');
    assert.throws(() => insert({ authority: 'A3', approval_id: id }), /live in-scope Owner approval/);
  } finally {
    cleanup();
  }
});

test('budget is a ratchet: spend cannot be rewound and ceilings need promotion', () => {
  const { db, cleanup } = opened();
  try {
    db.prepare("UPDATE budget_profiles SET spent_krw = 50000 WHERE profile_id = 'BP-LOCAL'").run();
    assert.throws(
      () => db.prepare("UPDATE budget_profiles SET spent_krw = 0 WHERE profile_id = 'BP-LOCAL'").run(),
      /spend cannot be lowered/,
    );
    assert.throws(
      () =>
        db
          .prepare("UPDATE budget_profiles SET monthly_limit_krw = 9000000 WHERE profile_id = 'BP-SCALE'")
          .run(),
      /needs Owner promotion/,
    );
  } finally {
    cleanup();
  }
});

test('a held lease cannot be stolen and the fencing token only moves forward', () => {
  const { db, cleanup } = opened();
  try {
    acquireLease(db, 'state/yeno.db', 'writer-a', 600_000);
    assert.throws(
      () =>
        db
          .prepare(
            "UPDATE write_leases SET holder = 'attacker', fencing_token = fencing_token + 1, acquired_at = ? WHERE resource = 'state/yeno.db'",
          )
          .run(new Date().toISOString()),
      /cannot be stolen/,
    );
    assert.throws(
      () => db.prepare("UPDATE write_leases SET fencing_token = 1 WHERE resource = 'state/yeno.db'").run(),
      /must increase/,
    );
    assert.throws(() => db.prepare("DELETE FROM write_leases WHERE resource = 'state/yeno.db'").run(), /not deleted/);
  } finally {
    cleanup();
  }
});

test('recorded denials are append-only evidence', () => {
  const { db, cleanup } = freshDb();
  try {
    admit(db, { goal: 'probe', authority: 'A2', methodClass: 'SAFE', budgetProfileId: 'BP-LOCAL', costP90Krw: 0 });
    assert.throws(() => db.prepare("UPDATE admission_attempts SET decision = 'ALLOW'").run(), /append-only/);
    assert.throws(() => db.prepare('DELETE FROM admission_attempts').run(), /append-only/);
    const report = admissionReport(db);
    assert.equal(report.stop_engaged, true);
    assert.equal(report.by_reason[0].reason_code, 'EMERGENCY_STOP_ENGAGED');
  } finally {
    cleanup();
  }
});

test('G3 needs a refused probe in every bypass class before it can pass', () => {
  const { db, cleanup } = opened();
  try {
    const empty = g3Acceptance(db);
    assert.equal(empty.classes_uncovered.length, BYPASS_CLASSES.length);
    assert.ok(promotionBlockers(db, 'G3').some((r) => r.includes('no refused probe for bypass class')));

    for (const bypassClass of BYPASS_CLASSES) {
      recordRedteamProbe(db, {
        suiteRef: 'test',
        bypassClass,
        attack: `${bypassClass} attack`,
        outcome: 'REFUSED',
        detail: 'schema refused',
      });
    }
    const covered = g3Acceptance(db);
    assert.deepEqual(covered.classes_uncovered, []);
    assert.deepEqual(covered.problems, []);

    // One allowed bypass is enough to fail the gate again.
    recordRedteamProbe(db, {
      suiteRef: 'test',
      bypassClass: 'RAW_SQL',
      attack: 'a bypass that worked',
      outcome: 'ALLOWED',
      detail: 'changed 1 row',
    });
    assert.ok(g3Acceptance(db).problems.some((p) => p.includes('were not refused')));
    assert.throws(
      () => db.prepare("UPDATE gates SET state = 'PASSED' WHERE gate_id = 'G3'").run(),
      /red-team probe in every bypass class/,
    );
  } finally {
    cleanup();
  }
});

test('red-team results cannot be rewritten to hide an allowed bypass', () => {
  const { db, cleanup } = opened();
  try {
    recordRedteamProbe(db, {
      suiteRef: 'test',
      bypassClass: 'LEASE',
      attack: 'stole a lease',
      outcome: 'ALLOWED',
      detail: 'it worked',
    });
    assert.throws(() => db.prepare("UPDATE redteam_probes SET outcome = 'REFUSED'").run(), /append-only/);
    assert.throws(() => db.prepare('DELETE FROM redteam_probes').run(), /append-only/);
  } finally {
    cleanup();
  }
});

test('an approval must cite an Owner Packet that exists on disk', () => {
  const { db, cleanup } = opened();
  try {
    assert.throws(() => grantApproval(db, grantSpec({ ownerPacketRef: undefined })), /needs the Owner Packet/);
    assert.throws(
      () => grantApproval(db, grantSpec({ ownerPacketRef: 'evidence/OWNER-PACKET-999.md' })),
      /does not exist on disk/,
    );
    const { approval_id: id } = grantApproval(db, grantSpec());
    assert.throws(
      () => db.prepare('UPDATE approvals SET owner_packet_ref = ? WHERE approval_id = ?').run('evidence/other.md', id),
      /Owner Packet reference of an approval is immutable/,
    );
    assert.throws(
      () =>
        db
          .prepare(
            `INSERT INTO approvals (approval_id, scope_hash, exact_action, target, payload_hash, max_cost_krw,
               expires_at, max_uses, uses, rollback_plan, granted_by, created_at)
             VALUES ('APR-forged', 'f', 'git.push', 'origin/main', '0', 0, '2099-01-01T00:00:00Z', 1, 0, 'none', 'owner', '2026-08-26T00:00:00Z')`,
          )
          .run(),
      /must cite the Owner Packet/,
    );
  } finally {
    cleanup();
  }
});

test('an unknown bypass class is rejected instead of silently widening coverage', () => {
  const { db, cleanup } = opened();
  try {
    assert.throws(
      () =>
        recordRedteamProbe(db, {
          suiteRef: 'test',
          bypassClass: 'TOTALLY_FINE',
          attack: 'x',
          outcome: 'REFUSED',
          detail: 'x',
        }),
      /unknown bypass class/,
    );
  } finally {
    cleanup();
  }
});
