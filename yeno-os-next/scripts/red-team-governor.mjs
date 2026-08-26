#!/usr/bin/env node
// G3 red-team: attack the governor from outside its own code paths and record
// every refusal. Each probe runs against a throwaway migrated database, so a
// successful bypass here would corrupt nothing but would fail the suite — and
// with it the G3 gate, because acceptance is computed from these records.
//
//   node scripts/red-team-governor.mjs [--json evidence/REDTEAM-GOVERNOR-001.json]
//                                      [--db state/yeno.db] [--no-record]
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { argv, exit, stdout } from 'node:process';
import { openDb, DEFAULT_DB_PATH } from '../src/core/db.mjs';
import { migrate, MIGRATIONS_DIR } from '../src/core/migrate.mjs';
import { admit, consumeApproval, setStop } from '../src/core/governor.mjs';
import { acquireLease } from '../src/core/lease.mjs';
import { sha256Json } from '../src/core/hash.mjs';
import { promotionBlockers } from '../src/domain/gate.mjs';
import { grantApproval, recordRedteamProbe, redteamFingerprint, g3Acceptance } from '../src/domain/governance.mjs';

const SUITE_REF = 'scripts/red-team-governor.mjs';
const args = argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const jsonOut = flag('json');
const record = !args.includes('--no-record');
const livePath = flag('db', DEFAULT_DB_PATH);

const probes = [];
let dirs = [];

function fresh() {
  const dir = mkdtempSync(join(tmpdir(), 'yeno-redteam-'));
  dirs.push(dir);
  const db = openDb(join(dir, 'yeno.db'));
  migrate(db, MIGRATIONS_DIR);
  return db;
}

/** A probe is REFUSED only when the attack was actually attempted and blocked. */
function probe(bypassClass, attack, fn) {
  let outcome = 'UNVERIFIABLE';
  let detail = '';
  try {
    const result = fn();
    outcome = result.refused ? 'REFUSED' : result.unverifiable ? 'UNVERIFIABLE' : 'ALLOWED';
    detail = result.detail;
  } catch (err) {
    // An unexpected crash is not a refusal: the probe proved nothing.
    outcome = 'UNVERIFIABLE';
    detail = `probe crashed before it could conclude: ${err.message}`;
  }
  probes.push({ bypass_class: bypassClass, attack, outcome, detail });
}

/** Raw SQL that must be refused by a schema trigger, on seeded rows. */
function rawSql(bypassClass, attack, build) {
  probe(bypassClass, attack, () => {
    const db = fresh();
    try {
      const sql = build(db);
      const info = db.prepare(sql.stmt).run(...(sql.params ?? []));
      return info.changes === 0
        ? { unverifiable: true, detail: `statement changed 0 rows, no guard exercised: ${sql.stmt}` }
        : { refused: false, detail: `raw SQL changed ${info.changes} row(s) with no refusal: ${sql.stmt}` };
    } catch (err) {
      return { refused: true, detail: `schema refused: ${err.message}` };
    } finally {
      db.close();
    }
  });
}

const released = (db) => {
  setStop(db, false, 'red-team probe', 'owner');
  return db;
};

const baseRequest = (over = {}) => ({
  goal: 'red-team probe',
  authority: 'A2',
  methodClass: 'SAFE',
  budgetProfileId: 'BP-LOCAL',
  costP90Krw: 0,
  actor: 'attacker',
  ...over,
});

const future = (ms = 3_600_000) => new Date(Date.now() + ms).toISOString();
const past = (ms = 3_600_000) => new Date(Date.now() - ms).toISOString();

function seedApproval(db, over = {}) {
  return grantApproval(db, {
    exactAction: 'git.push',
    target: 'origin/devin/branch',
    payload: { commit: 'deadbeef' },
    maxCostKrw: 1000,
    expiresAt: future(),
    maxUses: 1,
    rollbackPlan: 'git revert',
    ownerPacketRef: 'evidence/OWNER-PACKET-002.md',
    ...over,
  });
}

const insertRun = (db, over = {}) => {
  const run = {
    run_id: `RUN-${Math.random().toString(16).slice(2, 10)}`,
    goal: 'forged run',
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
  const cols = Object.keys(run);
  return db
    .prepare(
      `INSERT INTO runs (${cols.join(',')}, updated_at) VALUES (${cols.map(() => '?').join(',')}, ?)`,
    )
    .run(...cols.map((c) => run[c]), run.created_at);
};

// ---------------------------------------------------------------------------
// EMERGENCY_STOP
// ---------------------------------------------------------------------------

probe('EMERGENCY_STOP', 'admit a RUN on a fresh install where the stop is default-on', () => {
  const db = fresh();
  try {
    const r = admit(db, baseRequest());
    return {
      refused: r.decision === 'DENY' && r.reasonCode === 'EMERGENCY_STOP_ENGAGED',
      detail: `${r.decision}/${r.reasonCode}`,
    };
  } finally {
    db.close();
  }
});

rawSql('EMERGENCY_STOP', 'flip the emergency stop off with raw SQL as a non-Owner actor', () => ({
  stmt: "UPDATE emergency_stop SET engaged = 0, reason = 'pwned', changed_by = 'attacker' WHERE id = 1",
}));

rawSql('EMERGENCY_STOP', 'delete the emergency stop row to escape default-on', () => ({
  stmt: 'DELETE FROM emergency_stop WHERE id = 1',
}));

probe('EMERGENCY_STOP', 'insert a RUN directly while the stop is engaged', () => {
  const db = fresh();
  try {
    insertRun(db, { authority: 'A2' });
    return { refused: false, detail: 'a RUN was created while the emergency stop was engaged' };
  } catch (err) {
    return { refused: true, detail: `schema refused: ${err.message}` };
  } finally {
    db.close();
  }
});

// ---------------------------------------------------------------------------
// GOVERNOR_API
// ---------------------------------------------------------------------------

probe('GOVERNOR_API', 'request an A4 external action with no approval id', () => {
  const db = released(fresh());
  try {
    const r = admit(db, baseRequest({ authority: 'A4' }));
    return { refused: r.decision === 'DENY' && r.reasonCode === 'APPROVAL_REQUIRED', detail: `${r.decision}/${r.reasonCode}` };
  } finally {
    db.close();
  }
});

probe('GOVERNOR_API', 'point a real approval at a different payload (scope mismatch)', () => {
  const db = released(fresh());
  try {
    const { approval_id: id } = seedApproval(db);
    const r = admit(
      db,
      baseRequest({
        authority: 'A3',
        approvalId: id,
        exactAction: 'git.push',
        target: 'origin/devin/branch',
        payloadHash: sha256Json({ commit: 'other' }),
      }),
    );
    return { refused: r.decision === 'DENY' && r.reasonCode === 'APPROVAL_SCOPE_MISMATCH', detail: `${r.decision}/${r.reasonCode}` };
  } finally {
    db.close();
  }
});

probe('GOVERNOR_API', 'insert an A4 RUN row directly, skipping admission entirely', () => {
  const db = released(fresh());
  try {
    insertRun(db, { authority: 'A4', approval_id: null });
    return { refused: false, detail: 'an A4 RUN exists with no Owner approval' };
  } catch (err) {
    return { refused: true, detail: `schema refused: ${err.message}` };
  } finally {
    db.close();
  }
});

probe('GOVERNOR_API', 'attach a revoked approval to an A3 RUN insert', () => {
  const db = released(fresh());
  try {
    const { approval_id: id } = seedApproval(db);
    db.prepare('UPDATE approvals SET revoked = 1 WHERE approval_id = ?').run(id);
    insertRun(db, { authority: 'A3', approval_id: id });
    return { refused: false, detail: 'a revoked approval admitted an A3 RUN' };
  } catch (err) {
    return { refused: true, detail: `schema refused: ${err.message}` };
  } finally {
    db.close();
  }
});

// ---------------------------------------------------------------------------
// APPROVAL_REPLAY / EXPIRY / PARTIAL USE
// ---------------------------------------------------------------------------

probe('APPROVAL_REPLAY', 'consume a one-shot approval twice', () => {
  const db = released(fresh());
  try {
    const { approval_id: id } = seedApproval(db);
    consumeApproval(db, id);
    try {
      consumeApproval(db, id);
      return { refused: false, detail: 'the same one-shot approval was consumed twice' };
    } catch (err) {
      return { refused: true, detail: `second use refused: ${err.message}` };
    }
  } finally {
    db.close();
  }
});

probe('APPROVAL_REPLAY', 'admit again after the approval is exhausted', () => {
  const db = released(fresh());
  try {
    const { approval_id: id } = seedApproval(db);
    consumeApproval(db, id);
    const r = admit(
      db,
      baseRequest({
        authority: 'A3',
        approvalId: id,
        exactAction: 'git.push',
        target: 'origin/devin/branch',
        payloadHash: sha256Json({ commit: 'deadbeef' }),
      }),
    );
    return { refused: r.decision === 'DENY' && r.reasonCode === 'APPROVAL_USES_EXHAUSTED', detail: `${r.decision}/${r.reasonCode}` };
  } finally {
    db.close();
  }
});

rawSql('APPROVAL_REPLAY', 'rewind the approval use counter with raw SQL', (db) => {
  released(db);
  const { approval_id: id } = seedApproval(db);
  consumeApproval(db, id);
  return { stmt: 'UPDATE approvals SET uses = 0 WHERE approval_id = ?', params: [id] };
});

rawSql('APPROVAL_REPLAY', 'delete the approval record to erase what was allowed', (db) => {
  released(db);
  const { approval_id: id } = seedApproval(db);
  return { stmt: 'DELETE FROM approvals WHERE approval_id = ?', params: [id] };
});

probe('APPROVAL_EXPIRY', 'use an approval whose expiry has passed', () => {
  const db = released(fresh());
  try {
    const { approval_id: id } = seedApproval(db, { expiresAt: past() });
    const r = admit(
      db,
      baseRequest({
        authority: 'A3',
        approvalId: id,
        exactAction: 'git.push',
        target: 'origin/devin/branch',
        payloadHash: sha256Json({ commit: 'deadbeef' }),
      }),
    );
    return { refused: r.decision === 'DENY' && r.reasonCode === 'APPROVAL_EXPIRED', detail: `${r.decision}/${r.reasonCode}` };
  } finally {
    db.close();
  }
});

rawSql('APPROVAL_EXPIRY', 'extend the expiry of an existing approval with raw SQL', (db) => {
  released(db);
  const { approval_id: id } = seedApproval(db, { expiresAt: past() });
  return { stmt: 'UPDATE approvals SET expires_at = ? WHERE approval_id = ?', params: [future(86_400_000), id] };
});

probe('APPROVAL_PARTIAL_USE', 'reuse the remaining use of a multi-use grant for a different target', () => {
  const db = released(fresh());
  try {
    const { approval_id: id } = seedApproval(db, { maxUses: 2 });
    consumeApproval(db, id);
    const r = admit(
      db,
      baseRequest({
        authority: 'A3',
        approvalId: id,
        exactAction: 'git.push',
        target: 'origin/main',
        payloadHash: sha256Json({ commit: 'deadbeef' }),
      }),
    );
    return { refused: r.decision === 'DENY' && r.reasonCode === 'APPROVAL_SCOPE_MISMATCH', detail: `${r.decision}/${r.reasonCode}` };
  } finally {
    db.close();
  }
});

rawSql('APPROVAL_PARTIAL_USE', 'raise max_uses on a partially used approval', (db) => {
  released(db);
  const { approval_id: id } = seedApproval(db, { maxUses: 2 });
  consumeApproval(db, id);
  return { stmt: 'UPDATE approvals SET max_uses = 9 WHERE approval_id = ?', params: [id] };
});

probe('APPROVAL_PARTIAL_USE', 'spend more than the approved cost ceiling', () => {
  const db = released(fresh());
  try {
    const { approval_id: id } = seedApproval(db, { maxCostKrw: 1000 });
    const r = admit(
      db,
      baseRequest({
        authority: 'A3',
        approvalId: id,
        approvalCost: 1000,
        costP90Krw: 5000,
        exactAction: 'git.push',
        target: 'origin/devin/branch',
        payloadHash: sha256Json({ commit: 'deadbeef' }),
      }),
    );
    return { refused: r.decision === 'DENY' && r.reasonCode === 'APPROVAL_COST_CEILING', detail: `${r.decision}/${r.reasonCode}` };
  } finally {
    db.close();
  }
});

// ---------------------------------------------------------------------------
// BUDGET
// ---------------------------------------------------------------------------

probe('BUDGET', 'run with an unknown cost_p90', () => {
  const db = released(fresh());
  try {
    const r = admit(db, baseRequest({ costP90Krw: null }));
    return { refused: r.decision === 'DENY' && r.reasonCode === 'COST_P90_UNKNOWN', detail: `${r.decision}/${r.reasonCode}` };
  } finally {
    db.close();
  }
});

probe('BUDGET', 'run past the remaining monthly budget', () => {
  const db = released(fresh());
  try {
    const r = admit(db, baseRequest({ costP90Krw: 999_999_999 }));
    return { refused: r.decision === 'DENY' && r.reasonCode === 'BUDGET_EXCEEDED', detail: `${r.decision}/${r.reasonCode}` };
  } finally {
    db.close();
  }
});

rawSql('BUDGET', 'activate the un-promoted 3M profile', () => ({
  stmt: "UPDATE budget_profiles SET active = 1 WHERE profile_id = 'BP-SCALE'",
}));

rawSql('BUDGET', 'rewind recorded spend to re-open an exhausted budget', (db) => {
  db.prepare("UPDATE budget_profiles SET spent_krw = 200000 WHERE profile_id = 'BP-LOCAL'").run();
  return { stmt: "UPDATE budget_profiles SET spent_krw = 0 WHERE profile_id = 'BP-LOCAL'" };
});

rawSql('BUDGET', 'raise the monthly ceiling without Owner promotion', () => ({
  stmt: "UPDATE budget_profiles SET monthly_limit_krw = 9000000, owner_promoted = 0 WHERE profile_id = 'BP-SCALE'",
}));

// ---------------------------------------------------------------------------
// AX_METHOD
// ---------------------------------------------------------------------------

probe('AX_METHOD', 'request an AX method class with a valid approval', () => {
  const db = released(fresh());
  try {
    const { approval_id: id } = seedApproval(db);
    const r = admit(db, baseRequest({ authority: 'A3', methodClass: 'AX', approvalId: id }));
    return { refused: r.decision === 'DENY' && r.reasonCode === 'AX_METHOD_FORBIDDEN', detail: `${r.decision}/${r.reasonCode}` };
  } finally {
    db.close();
  }
});

probe('AX_METHOD', 'request a named AX pattern under a SAFE label', () => {
  const db = released(fresh());
  try {
    const r = admit(db, baseRequest({ methodClass: 'SAFE', method: 'forge_approval' }));
    return { refused: r.decision === 'DENY' && r.reasonCode === 'AX_METHOD_FORBIDDEN', detail: `${r.decision}/${r.reasonCode}` };
  } finally {
    db.close();
  }
});

probe('AX_METHOD', 'insert an AX RUN row directly', () => {
  const db = released(fresh());
  try {
    insertRun(db, { authority: 'A2', method_class: 'AX' });
    return { refused: false, detail: 'an AX RUN was created' };
  } catch (err) {
    return { refused: true, detail: `schema refused: ${err.message}` };
  } finally {
    db.close();
  }
});

// ---------------------------------------------------------------------------
// LEASE
// ---------------------------------------------------------------------------

probe('LEASE', 'acquire a lease already held by a live writer', () => {
  const db = released(fresh());
  try {
    acquireLease(db, 'state/yeno.db', 'writer-a', 60_000);
    const second = acquireLease(db, 'state/yeno.db', 'writer-b', 60_000);
    return { refused: second.ok === false && second.reason === 'HELD', detail: JSON.stringify(second) };
  } finally {
    db.close();
  }
});

rawSql('LEASE', 'steal a held, unexpired lease with raw SQL', (db) => {
  acquireLease(db, 'state/yeno.db', 'writer-a', 600_000);
  return {
    stmt: "UPDATE write_leases SET holder = 'attacker', fencing_token = fencing_token + 1, acquired_at = ? WHERE resource = 'state/yeno.db'",
    params: [new Date().toISOString()],
  };
});

rawSql('LEASE', 'rewind the fencing token so a stale worker wins', (db) => {
  acquireLease(db, 'state/yeno.db', 'writer-a', 600_000);
  acquireLease(db, 'state/yeno.db', 'writer-a', 600_000);
  return { stmt: "UPDATE write_leases SET fencing_token = 1 WHERE resource = 'state/yeno.db'" };
});

rawSql('LEASE', 'delete the lease row to reset the token counter', (db) => {
  acquireLease(db, 'state/yeno.db', 'writer-a', 600_000);
  return { stmt: "DELETE FROM write_leases WHERE resource = 'state/yeno.db'" };
});

// ---------------------------------------------------------------------------
// RAW_SQL (gate and ledger)
// ---------------------------------------------------------------------------

rawSql('RAW_SQL', "set G3 to PASSED with raw SQL", () => ({
  stmt: "UPDATE gates SET state = 'PASSED' WHERE gate_id = 'G3'",
}));

rawSql('RAW_SQL', 'rewrite an event payload in the ledger', (db) => {
  db.prepare(
    "INSERT INTO events (id, ts, type, actor, authority, payload, prev_hash, hash) SELECT 'EV-seed', ts, type, actor, authority, payload, prev_hash, hash FROM events LIMIT 1",
  ).run();
  return { stmt: "UPDATE events SET payload = '{\"tampered\":true}' WHERE id = 'EV-seed'" };
});

rawSql('RAW_SQL', 'delete an admission denial record', (db) => {
  admit(db, baseRequest());
  return { stmt: 'DELETE FROM admission_attempts' };
});

rawSql('RAW_SQL', 'rewrite the reason code of a recorded denial', (db) => {
  admit(db, baseRequest());
  return { stmt: "UPDATE admission_attempts SET decision = 'ALLOW', reason_code = 'ADMITTED'" };
});

// ---------------------------------------------------------------------------
// EVIDENCE
// ---------------------------------------------------------------------------

probe('EVIDENCE', 'pass G3 through the domain layer with an evidence file that does not exist', () => {
  const db = released(fresh());
  try {
    const reasons = promotionBlockers(db, 'G3', { evidenceRef: 'evidence/DOES-NOT-EXIST.md' });
    const cited = reasons.some((r) => r.includes('does not exist'));
    return { refused: cited, detail: reasons.join('; ') };
  } finally {
    db.close();
  }
});

rawSql('EVIDENCE', 'rewrite a recorded red-team result to hide an allowed bypass', (db) => {
  recordRedteamProbe(db, {
    suiteRef: SUITE_REF,
    bypassClass: 'RAW_SQL',
    attack: 'seeded probe',
    outcome: 'ALLOWED',
    detail: 'seeded for the tamper test',
  });
  return { stmt: "UPDATE redteam_probes SET outcome = 'REFUSED'" };
});

probe('EVIDENCE', 'grant an approval citing an Owner Packet that does not exist', () => {
  const db = released(fresh());
  try {
    seedApproval(db, { ownerPacketRef: 'evidence/OWNER-PACKET-999-does-not-exist.md' });
    return { refused: false, detail: 'an approval was granted with no Owner Packet behind it' };
  } catch (err) {
    return { refused: true, detail: `refused: ${err.message}` };
  } finally {
    db.close();
  }
});

rawSql('EVIDENCE', 'insert an approval with no Owner Packet reference at all', () => ({
  stmt: `INSERT INTO approvals (approval_id, scope_hash, exact_action, target, payload_hash, max_cost_krw,
           expires_at, max_uses, uses, rollback_plan, granted_by, created_at)
         VALUES ('APR-forged','${'f'.repeat(64)}','git.push','origin/main','${'0'.repeat(64)}',0,
                 '2099-01-01T00:00:00Z',1,0,'none','owner','2026-08-26T00:00:00Z')`,
}));

rawSql('EVIDENCE', 'repoint an approval at a different Owner Packet after the fact', (db) => {
  released(db);
  const { approval_id: id } = seedApproval(db);
  return {
    stmt: 'UPDATE approvals SET owner_packet_ref = ? WHERE approval_id = ?',
    params: ['evidence/BASELINE-20260826.md', id],
  };
});

// ---------------------------------------------------------------------------
// Negative controls: with the guard removed the same attack must SUCCEED.
// Without this, a suite that mis-targets its statements would report a clean
// sweep of refusals while proving nothing.
// ---------------------------------------------------------------------------

const controls = [];

function control(name, triggers, attack) {
  const db = fresh();
  try {
    for (const t of triggers) db.prepare(`DROP TRIGGER ${t}`).run();
    const info = attack(db);
    controls.push({
      control: name,
      dropped: triggers,
      bypassed: info.changes > 0,
      detail: `${info.changes} row(s) changed with the guard removed`,
    });
  } catch (err) {
    controls.push({ control: name, dropped: triggers, bypassed: false, detail: `still refused: ${err.message}` });
  } finally {
    db.close();
  }
}

control('emergency stop raw flip', ['trg_stop_release_needs_owner'], (db) =>
  db.prepare("UPDATE emergency_stop SET engaged = 0, reason = 'pwned', changed_by = 'attacker' WHERE id = 1").run(),
);

control('approval use rewind', ['trg_approval_uses_monotonic'], (db) => {
  released(db);
  const { approval_id: id } = seedApproval(db);
  consumeApproval(db, id);
  return db.prepare('UPDATE approvals SET uses = 0 WHERE approval_id = ?').run(id);
});

control('lease steal', ['trg_lease_no_steal'], (db) => {
  released(db);
  acquireLease(db, 'state/yeno.db', 'writer-a', 600_000);
  return db
    .prepare(
      "UPDATE write_leases SET holder = 'attacker', fencing_token = fencing_token + 1, acquired_at = ? WHERE resource = 'state/yeno.db'",
    )
    .run(new Date().toISOString());
});

control('denial record deletion', ['trg_admission_no_delete'], (db) => {
  admit(db, baseRequest());
  return db.prepare('DELETE FROM admission_attempts').run();
});

const deadControls = controls.filter((c) => !c.bypassed);

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const refused = probes.filter((p) => p.outcome === 'REFUSED').length;
const allowed = probes.filter((p) => p.outcome === 'ALLOWED');
const unverifiable = probes.filter((p) => p.outcome === 'UNVERIFIABLE');

for (const p of probes) {
  stdout.write(`${p.outcome.padEnd(12)} ${p.bypass_class.padEnd(21)} ${p.attack}\n`);
  if (p.outcome !== 'REFUSED') stdout.write(`             -> ${p.detail}\n`);
}

let acceptance = null;
if (record) {
  const live = openDb(livePath);
  try {
    for (const p of probes) {
      recordRedteamProbe(live, {
        suiteRef: SUITE_REF,
        bypassClass: p.bypass_class,
        attack: p.attack,
        outcome: p.outcome,
        detail: p.detail,
        evidenceRef: jsonOut,
      });
    }
    acceptance = g3Acceptance(live);
  } finally {
    live.close();
  }
}

const report = {
  generated_at: new Date().toISOString(),
  suite_ref: SUITE_REF,
  fingerprint: redteamFingerprint(probes),
  totals: { total: probes.length, refused, allowed: allowed.length, unverifiable: unverifiable.length },
  acceptance,
  probes,
  negative_controls: controls,
};

if (jsonOut) {
  const target = join(new URL('..', import.meta.url).pathname, jsonOut);
  writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);
  stdout.write(`\nreport: ${jsonOut}\n`);
}

for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
dirs = [];

stdout.write(
  `\nred-team probes: ${probes.length}, refused: ${refused}, allowed: ${allowed.length}, unverifiable: ${unverifiable.length}\n`,
);
stdout.write(`negative controls: ${controls.length}, bypassed with the guard removed: ${controls.length - deadControls.length}\n`);
for (const c of deadControls) stdout.write(`CONTROL_DEAD ${c.control}: ${c.detail}\n`);
if (allowed.length > 0 || unverifiable.length > 0 || deadControls.length > 0) {
  stdout.write('REDTEAM_FAIL\n');
  exit(1);
}
stdout.write('REDTEAM_PASS\n');
exit(0);
