// G8 read side. The desktop shell is not built (it needs a Rust toolchain that
// is not installed), but its only legitimate job is already testable: render
// these panels and nothing else. Two properties are under test — the surface can
// be served with no write privilege at all, and no panel may show a state the
// base tables do not support.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './helpers.mjs';
import { openDb } from '../src/core/db.mjs';
import { appendEvent } from '../src/core/events.mjs';
import { setStop } from '../src/core/governor.mjs';
import { grantApproval } from '../src/domain/governance.mjs';
import { ingest, registerParsers } from '../src/domain/intake.mjs';
import { readFileSync } from 'node:fs';
import {
  PANELS,
  panel,
  panels,
  g8ReadSideAcceptance,
} from '../src/domain/mission-control.mjs';

test('every panel resolves on a brand-new kernel and the surface accepts', () => {
  const ctx = freshDb();
  try {
    const out = panels(ctx.db);
    assert.deepEqual(Object.keys(out.panels), PANELS);
    for (const name of PANELS) assert.equal(typeof out.panels[name].total, 'number');
    // A fresh install must read as stopped in the Settings panel, not as running.
    assert.equal(out.panels.settings.rows[0].emergency_stop_engaged, 1);
    assert.equal(out.panels.settings.attention, 1);
    assert.equal(g8ReadSideAcceptance(ctx.db).ok, true);
  } finally {
    ctx.cleanup();
  }
});

test('the whole surface can be drawn from a read-only handle', () => {
  const ctx = freshDb();
  try {
    registerParsers(ctx.db);
    ingest(ctx.db, {
      bytes: Buffer.from('# t\nthe fare is 1500 KRW\n', 'utf8'),
      kind: 'FILE',
      originRef: 'test://mc/source.md',
      parserId: 'plain-file/v1',
    });
    ctx.db.close();

    const ro = openDb(ctx.path, { readOnly: true });
    const out = panels(ro);
    assert.equal(out.panels.inbox.total, 1);
    assert.equal(g8ReadSideAcceptance(ro).ok, true);
    // And the read-only handle really is read-only: a write must be refused.
    assert.throws(() => ro.exec("UPDATE projects SET name = 'x'"), /readonly|read-only/i);
    ro.close();
  } finally {
    ctx.cleanup();
  }
});

test('the module cannot write: no panel query mutates anything', () => {
  const src = readFileSync(new URL('../src/domain/mission-control.mjs', import.meta.url), 'utf8');
  const body = src.replace(/\/\*\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const word of ['INSERT', 'UPDATE ', 'DELETE', 'DROP', 'CREATE', 'BEGIN']) {
    assert.equal(body.includes(word), false, `mission-control must not contain ${word}`);
  }
});

test('an expired approval is never drawn as live', () => {
  const ctx = freshDb();
  const { db } = ctx;
  try {
    setStop(db, false, 'mc test', 'owner');
    const packet = 'evidence/OWNER-PACKET-002.md';
    const live = grantApproval(db, {
      exactAction: 'mc.test.action',
      target: 'test://mc/live',
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      rollbackPlan: 'nothing to roll back',
      ownerPacketRef: packet,
      maxUses: 1,
    });
    const stale = grantApproval(db, {
      exactAction: 'mc.test.action',
      target: 'test://mc/stale',
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
      rollbackPlan: 'nothing to roll back',
      ownerPacketRef: packet,
      maxUses: 1,
    });
    const rows = panel(db, 'approvals').rows;
    const byId = new Map(rows.map((r) => [r.approval_id, r.state]));
    assert.equal(byId.get(live.approval_id), 'LIVE');
    assert.equal(byId.get(stale.approval_id), 'EXPIRED');
    assert.equal(panel(db, 'approvals').attention, 1);
  } finally {
    ctx.cleanup();
  }
});

test('a goal cannot read as decided without a verdict, even after raw SQL', () => {
  const ctx = freshDb();
  const { db } = ctx;
  try {
    const desireId = db.prepare('SELECT desire_id FROM desires LIMIT 1').get().desire_id;
    db.prepare(
      `INSERT INTO desire_activations (activation_id, desire_id, activation, trigger_kind, trigger_ref, ts)
       VALUES ('ACT-forged', ?, 0.5, 'OWNER', 'test://mc', '2026-08-26T00:00:00.000Z')`,
    ).run(desireId);
    db.prepare(
      `INSERT INTO goals (goal_id, statement, rationale, desire_id, activation_id, priority_raw, state, created_at)
       VALUES ('GOAL-forged', 'forged', 'none', ?, 'ACT-forged', 10, 'PROPOSED', '2026-08-26T00:00:00.000Z')`,
    ).run(desireId);
    assert.equal(g8ReadSideAcceptance(db).ok, true);

    // First line of defence: the schema refuses the forgery outright.
    assert.throws(
      () => db.exec("UPDATE goals SET state = 'SELECTED' WHERE goal_id = 'GOAL-forged'"),
      /only be SELECTED by a passing council verdict/,
    );

    // Second line: even with that trigger gone — a tampered file, an older
    // schema — the read side must still refuse to draw the goal as decided.
    db.exec('DROP TRIGGER trg_goal_select_needs_verdict');
    db.exec("UPDATE goals SET state = 'SELECTED' WHERE goal_id = 'GOAL-forged'");
    const council = panel(db, 'council').rows.find((r) => r.goal_id === 'GOAL-forged');
    assert.equal(council.decision, null);
    const acc = g8ReadSideAcceptance(db);
    assert.equal(acc.ok, false);
    assert.equal(
      acc.checks.find((c) => c.name === 'no_goal_shown_decided_without_verdict').ok,
      false,
    );
  } finally {
    ctx.cleanup();
  }
});

test('the timeline panel is the ledger, newest first, with the payload intact', () => {
  const ctx = freshDb();
  const { db } = ctx;
  try {
    appendEvent(db, { type: 'mc.test.one', payload: { n: 1 }, actor: 'test', authority: 'A1' });
    appendEvent(db, { type: 'mc.test.two', payload: { n: 2 }, actor: 'test', authority: 'A1' });
    const rows = panel(db, 'timeline').rows;
    assert.equal(rows[0].type, 'mc.test.two');
    assert.equal(JSON.parse(rows[0].payload).n, 2);
    assert.ok(rows[0].seq > rows[1].seq);
    assert.equal(panel(db, 'timeline').total, db.prepare('SELECT COUNT(*) AS n FROM events').get().n);
  } finally {
    ctx.cleanup();
  }
});

test('panels are deterministic: the same ledger renders byte-identical twice', () => {
  const ctx = freshDb();
  const { db } = ctx;
  try {
    appendEvent(db, { type: 'mc.test.det', payload: { n: 1 }, actor: 'test', authority: 'A1' });
    const a = JSON.stringify(panels(db));
    const b = JSON.stringify(panels(db));
    assert.equal(a, b);
    assert.equal(JSON.parse(a).head_seq, db.prepare('SELECT MAX(seq) AS s FROM events').get().s);
  } finally {
    ctx.cleanup();
  }
});

test('an unknown panel is refused rather than invented', () => {
  const ctx = freshDb();
  try {
    assert.throws(() => panel(ctx.db, 'living_body'), /unknown panel/);
  } finally {
    ctx.cleanup();
  }
});
