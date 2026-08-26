// G2 Unbounded Intake. The properties under test are the ones a gate promotion
// would otherwise have to be trusted on: a title never becomes a project, a
// recovered body must name the bytes it came from, re-importing the same bytes
// cannot fork state, and none of it can be talked around with raw SQL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, fixedClock } from './helpers.mjs';
import {
  registerParsers,
  ingest,
  recordRecoveryAttempt,
  promoteInbox,
  recordCandidateProbe,
  intakeCoverage,
} from '../src/domain/intake.mjs';

const TITLE_LEDGER = `# 144 title recovery ledger

- TSP-001 | 원앙 프로젝트 착수
- TSP-002 | YENO 항상성 설계
- TSP-003 | Living Body 트레이 상태색
`;

const CHATGPT_EXPORT = JSON.stringify([
  {
    id: 'conv-a',
    title: 'YENO 항상성 설계',
    create_time: 1756000000,
    mapping: {
      m1: { message: { author: { role: 'user' }, create_time: 1756000001, content: { parts: ['항상성을 어떻게 재는가'] } } },
      m2: { message: { author: { role: 'assistant' }, create_time: 1756000002, content: { parts: ['waiting blockers와 budget으로 재고, 욕망 활성치로 바꾼다'] } } },
    },
  },
]);

function setup() {
  const ctx = freshDb();
  registerParsers(ctx.db, fixedClock());
  return ctx;
}

test('a parsed title becomes an unresolved inbox item, never a project', (t) => {
  const { db, cleanup } = setup();
  t.after(cleanup);
  const clock = fixedClock();

  const result = ingest(db, { bytes: TITLE_LEDGER, kind: 'MANUAL', originRef: 'ledger/144-v1.md', parserId: 'title-ledger/v1' }, clock);
  assert.equal(result.outcome, 'ACCEPTED');
  assert.equal(result.new_items, 3);
  assert.equal(result.bodies_recovered, 0);

  const items = db.prepare('SELECT * FROM inbox_items ORDER BY title').all();
  assert.equal(items.length, 3);
  for (const item of items) {
    assert.equal(item.state, 'BODY_MISSING');
    assert.equal(item.source_version_id, null, 'a title has no body bytes to point at');
    assert.notEqual(item.next_action.trim(), '');
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM projects').get().n, 0);
});

test('re-importing identical bytes from the same origin is a DUPLICATE, not a fork', (t) => {
  const { db, cleanup } = setup();
  t.after(cleanup);
  const clock = fixedClock();
  const input = { bytes: TITLE_LEDGER, kind: 'MANUAL', originRef: 'ledger/144-v1.md', parserId: 'title-ledger/v1' };

  const first = ingest(db, input, clock);
  const second = ingest(db, input, clock);
  const third = ingest(db, input, clock);

  assert.equal(first.outcome, 'ACCEPTED');
  assert.equal(second.outcome, 'DUPLICATE');
  assert.equal(third.outcome, 'DUPLICATE');
  assert.equal(second.source_version_id, first.source_version_id);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM inbox_items').get().n, 3, 'no duplicate items');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM source_versions').get().n, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM blobs').get().n, 1, 'the vault stores the bytes once');
});

test('the same bytes from a different origin keep separate provenance', (t) => {
  const { db, cleanup } = setup();
  t.after(cleanup);
  const clock = fixedClock();

  const a = ingest(db, { bytes: TITLE_LEDGER, kind: 'MANUAL', originRef: 'ledger/144-v1.md', parserId: 'title-ledger/v1' }, clock);
  const b = ingest(db, { bytes: TITLE_LEDGER, kind: 'MANUAL', originRef: 'owner-usb/144-copy.md', parserId: 'title-ledger/v1' }, clock);

  assert.equal(b.outcome, 'ACCEPTED');
  assert.notEqual(b.source_version_id, a.source_version_id);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sources').get().n, 2);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM blobs').get().n, 1, 'identical bytes are still stored once');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM inbox_items').get().n, 3, 'the same conversations do not duplicate');
});

test('an export with bodies recovers the matching titles and records provenance', (t) => {
  const { db, cleanup } = setup();
  t.after(cleanup);
  const clock = fixedClock();

  ingest(db, { bytes: TITLE_LEDGER, kind: 'MANUAL', originRef: 'ledger/144-v1.md', parserId: 'title-ledger/v1' }, clock);
  const exported = ingest(
    db,
    { bytes: CHATGPT_EXPORT, kind: 'CHAT_EXPORT', originRef: 'chatgpt/official-export-2026-08-26.json', parserId: 'chatgpt-export/v1' },
    clock,
  );

  assert.equal(exported.outcome, 'ACCEPTED');
  const recovered = db.prepare("SELECT * FROM inbox_items WHERE state = 'RECOVERED'").all();
  assert.equal(recovered.length, 1);
  assert.equal(recovered[0].title, 'YENO 항상성 설계');
  assert.equal(recovered[0].source_version_id, exported.source_version_id);
  const attempts = db.prepare('SELECT * FROM recovery_attempts WHERE inbox_id = ?').all(recovered[0].inbox_id);
  assert.equal(attempts.length, 1, 'recovery is a recorded attempt, not an assumption');
  assert.equal(attempts[0].method, 'OFFICIAL_EXPORT');
  assert.equal(attempts[0].source_version_id, exported.source_version_id);
});

test('promotion is refused for a title and allowed for a recovered body with evidence', (t) => {
  const { db, cleanup } = setup();
  t.after(cleanup);
  const clock = fixedClock();

  ingest(db, { bytes: TITLE_LEDGER, kind: 'MANUAL', originRef: 'ledger/144-v1.md', parserId: 'title-ledger/v1' }, clock);
  const titleOnly = db.prepare("SELECT * FROM inbox_items WHERE state = 'BODY_MISSING' ORDER BY title LIMIT 1").get();

  const refused = promoteInbox(db, titleOnly.inbox_id, { code: 'PRJ-1', name: titleOnly.title }, clock);
  assert.equal(refused.promoted, false);
  assert.match(refused.reasons.join(' '), /title-only promotion refused/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM projects').get().n, 0);

  const exported = ingest(
    db,
    { bytes: CHATGPT_EXPORT, kind: 'CHAT_EXPORT', originRef: 'chatgpt/official-export-2026-08-26.json', parserId: 'chatgpt-export/v1' },
    clock,
  );
  const withBody = db.prepare("SELECT * FROM inbox_items WHERE state = 'RECOVERED' LIMIT 1").get();

  const noEvidence = promoteInbox(db, withBody.inbox_id, { code: 'PRJ-2', name: withBody.title }, clock);
  assert.equal(noEvidence.promoted, false, 'a body still needs an evidence ref');

  const ok = promoteInbox(
    db,
    withBody.inbox_id,
    { code: 'PRJ-2', name: withBody.title, bodyEvidenceRef: `sv:${exported.source_version_id}` },
    clock,
  );
  assert.equal(ok.promoted, true);
  const project = db.prepare('SELECT * FROM projects WHERE project_id = ?').get(ok.project_id);
  assert.equal(project.promoted_from_inbox, withBody.inbox_id);
  assert.equal(db.prepare('SELECT state FROM inbox_items WHERE inbox_id = ?').get(withBody.inbox_id).state, 'PROMOTED');
});

test('an Owner confirmation can promote a title, and it is recorded as such', (t) => {
  const { db, cleanup } = setup();
  t.after(cleanup);
  const clock = fixedClock();

  ingest(db, { bytes: TITLE_LEDGER, kind: 'MANUAL', originRef: 'ledger/144-v1.md', parserId: 'title-ledger/v1' }, clock);
  const item = db.prepare("SELECT * FROM inbox_items WHERE state = 'BODY_MISSING' ORDER BY title LIMIT 1").get();

  const ok = promoteInbox(
    db,
    item.inbox_id,
    { code: 'PRJ-OWNER', name: item.title, ownerConfirmationRef: 'evidence/OWNER-PACKET-002.md#q3' },
    clock,
  );
  assert.equal(ok.promoted, true);
  const project = db.prepare('SELECT * FROM projects WHERE project_id = ?').get(ok.project_id);
  assert.equal(project.body_evidence_ref, null);
  assert.equal(project.owner_confirmation_ref, 'evidence/OWNER-PACKET-002.md#q3');
  assert.equal(intakeCoverage(db).ok, true, 'an Owner-confirmed promotion is not a title-only project');
});

test('the schema refuses a recovered state that no recovery attempt produced', (t) => {
  const { db, cleanup } = setup();
  t.after(cleanup);
  const clock = fixedClock();

  const first = ingest(db, { bytes: TITLE_LEDGER, kind: 'MANUAL', originRef: 'ledger/144-v1.md', parserId: 'title-ledger/v1' }, clock);
  const item = db.prepare("SELECT * FROM inbox_items WHERE state = 'BODY_MISSING' LIMIT 1").get();

  assert.throws(
    () => db.prepare("UPDATE inbox_items SET state = 'RECOVERED' WHERE inbox_id = ?").run(item.inbox_id),
    /recorded recovery attempt/,
    'a body claim with no provenance at all',
  );
  assert.throws(
    () =>
      db
        .prepare("UPDATE inbox_items SET state = 'RECOVERED', source_version_id = ? WHERE inbox_id = ?")
        .run(first.source_version_id, item.inbox_id),
    /recorded recovery attempt/,
    'provenance alone is not an attempt',
  );
  assert.throws(
    () => db.prepare("UPDATE inbox_items SET next_action = '   ' WHERE inbox_id = ?").run(item.inbox_id),
    /needs a next action/,
  );
  recordRecoveryAttempt(db, item.inbox_id, { method: 'LINK_FETCH', outcome: 'NOT_FOUND', detail: '404' }, clock);
  assert.equal(db.prepare('SELECT attempts FROM inbox_items WHERE inbox_id = ?').get(item.inbox_id).attempts, 1);
  assert.throws(
    () => db.prepare('UPDATE inbox_items SET attempts = 0 WHERE inbox_id = ?').run(item.inbox_id),
    /cannot be lowered/,
    'a failed recovery history cannot be erased by resetting the counter',
  );
});

test('the intake ledger and recovery attempts are append-only evidence', (t) => {
  const { db, cleanup } = setup();
  t.after(cleanup);
  const clock = fixedClock();

  ingest(db, { bytes: TITLE_LEDGER, kind: 'MANUAL', originRef: 'ledger/144-v1.md', parserId: 'title-ledger/v1' }, clock);
  assert.throws(() => db.prepare("UPDATE intakes SET outcome = 'ACCEPTED'").run(), /append-only/);
  assert.throws(() => db.prepare('DELETE FROM intakes').run(), /cannot be deleted/);

  const item = db.prepare('SELECT * FROM inbox_items LIMIT 1').get();
  recordRecoveryAttempt(
    db,
    item.inbox_id,
    { method: 'LINK_FETCH', outcome: 'NOT_FOUND', detail: 'link returns 404' },
    clock,
  );
  assert.throws(() => db.prepare("UPDATE recovery_attempts SET outcome = 'RECOVERED'").run(), /cannot be rewritten/);
  assert.throws(() => db.prepare('DELETE FROM recovery_attempts').run(), /cannot be deleted/);
});

test('a failed recovery is a state with a next action, not a silent drop', (t) => {
  const { db, cleanup } = setup();
  t.after(cleanup);
  const clock = fixedClock();

  ingest(db, { bytes: TITLE_LEDGER, kind: 'MANUAL', originRef: 'ledger/144-v1.md', parserId: 'title-ledger/v1' }, clock);
  const item = db.prepare('SELECT * FROM inbox_items LIMIT 1').get();

  const notFound = recordRecoveryAttempt(db, item.inbox_id, { method: 'LINK_FETCH', outcome: 'NOT_FOUND', detail: '404' }, clock);
  assert.equal(notFound.state, 'NEEDS_SOURCE');
  assert.equal(notFound.attempts, 1);
  const blocked = recordRecoveryAttempt(db, item.inbox_id, { method: 'MANUAL_SEARCH', outcome: 'BLOCKED', detail: 'login wall' }, clock);
  assert.equal(blocked.state, 'BLOCKED');
  assert.equal(blocked.attempts, 2);

  const row = db.prepare('SELECT * FROM v_recovery_ledger WHERE inbox_id = ?').get(item.inbox_id);
  assert.equal(row.attempts_recorded, 2);
  assert.equal(row.last_outcome, 'BLOCKED');
  assert.notEqual(row.next_action.trim(), '');
  assert.equal(intakeCoverage(db).ok, true, 'a blocked item is covered, not missing');
});

test('claiming a recovered body without bytes is refused at the attempt level too', (t) => {
  const { db, cleanup } = setup();
  t.after(cleanup);
  const clock = fixedClock();

  ingest(db, { bytes: TITLE_LEDGER, kind: 'MANUAL', originRef: 'ledger/144-v1.md', parserId: 'title-ledger/v1' }, clock);
  const item = db.prepare('SELECT * FROM inbox_items LIMIT 1').get();

  assert.throws(
    () => recordRecoveryAttempt(db, item.inbox_id, { method: 'OWNER_STATEMENT', outcome: 'RECOVERED', detail: 'remembered it' }, clock),
    /must name the source_version/,
  );
  assert.equal(db.prepare('SELECT state FROM inbox_items WHERE inbox_id = ?').get(item.inbox_id).state, 'BODY_MISSING');
});

test('the named source candidate is a recorded state and is never guessed', (t) => {
  const { db, cleanup } = setup();
  t.after(cleanup);
  const clock = fixedClock();

  const seeded = db.prepare("SELECT * FROM source_candidates WHERE url LIKE '%angeldot_%'").get();
  assert.ok(seeded, 'the candidate named in the contract is seeded by the migration');
  assert.equal(seeded.state, 'UNATTEMPTED');

  const unreachable = recordCandidateProbe(db, seeded.candidate_id, { state: 'UNREACHABLE', detail: 'no network authority' }, clock);
  assert.equal(unreachable.state, 'UNREACHABLE');
  assert.throws(
    () => db.prepare("UPDATE source_candidates SET state = 'FETCHED' WHERE candidate_id = ?").run(seeded.candidate_id),
    /needs evidence of the fetch/,
  );
});

test('coverage reports every item and fails loudly when an invariant breaks', (t) => {
  const { db, cleanup } = setup();
  t.after(cleanup);
  const clock = fixedClock();

  ingest(db, { bytes: TITLE_LEDGER, kind: 'MANUAL', originRef: 'ledger/144-v1.md', parserId: 'title-ledger/v1' }, clock);
  const clean = intakeCoverage(db);
  assert.equal(clean.ok, true, clean.problems.join('; '));
  assert.equal(clean.invariant.inbox_items, 3);
  assert.equal(clean.invariant.items_without_next_action, 0);
  assert.equal(clean.invariant.title_only_projects, 0);
  assert.ok(clean.invariant.active_parsers > 0);

  // A hand-made title-only project is what the invariant exists to catch.
  const item = db.prepare('SELECT * FROM inbox_items LIMIT 1').get();
  db.exec('PRAGMA foreign_keys = OFF');
  assert.throws(
    () =>
      db
        .prepare(
          `INSERT INTO projects (project_id, code, name, status, priority_raw, promoted_from_inbox, created_at, updated_at)
           VALUES ('PRJ-FORGED', 'FORGED', ?, 'REGISTRY', 0, ?, '2026-08-26T00:00:00.000Z', '2026-08-26T00:00:00.000Z')`,
        )
        .run(item.title, item.inbox_id),
    /title-only promotion requires body or owner evidence/,
  );
});

test('an unparseable input is REJECTED as evidence and changes no state', (t) => {
  const { db, cleanup } = setup();
  t.after(cleanup);
  const clock = fixedClock();

  const bad = ingest(db, { bytes: '{ not json at all', kind: 'CHAT_EXPORT', originRef: 'chatgpt/broken.json', parserId: 'chatgpt-export/v1' }, clock);
  assert.equal(bad.outcome, 'REJECTED');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM inbox_items').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM source_versions').get().n, 0);
  const ledger = db.prepare('SELECT * FROM intakes WHERE intake_id = ?').get(bad.intake_id);
  assert.equal(ledger.outcome, 'REJECTED');
  assert.match(ledger.reason, /parse failed/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM blobs').get().n, 1, 'the rejected bytes are still sealed for review');
});

test('an accepted intake cannot be recorded without the provenance it claims', (t) => {
  const { db, cleanup } = setup();
  t.after(cleanup);

  assert.throws(
    () =>
      db
        .prepare(
          `INSERT INTO intakes (intake_id, parser_id, source_id, source_version_id, origin_ref, blob_sha256,
             size_bytes, outcome, reason, titles_seen, bodies_recovered, created_at)
           VALUES ('INTK-FORGED', 'title-ledger/v1', NULL, NULL, 'nowhere', 'deadbeef', 1, 'ACCEPTED', NULL, 9, 9,
                   '2026-08-26T00:00:00.000Z')`,
        )
        .run(),
    /accepted intake needs a source_version/,
  );
});
