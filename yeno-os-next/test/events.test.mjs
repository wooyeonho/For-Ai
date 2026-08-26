import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendEvent, verifyChain, head, readEvents } from '../src/core/events.mjs';
import { canonicalJson, ZERO_HASH } from '../src/core/hash.mjs';
import { freshDb, fixedClock } from './helpers.mjs';

test('the first event chains from the zero hash and the chain verifies', () => {
  const { db, cleanup } = freshDb();
  try {
    const ev = appendEvent(db, { type: 'test.one', actor: 'test', payload: { b: 2, a: 1 } }, fixedClock());
    assert.equal(ev.prev_hash, ZERO_HASH);
    assert.equal(ev.seq, 1);
    const chain = verifyChain(db);
    assert.equal(chain.ok, true);
    assert.equal(chain.count, 1);
    assert.equal(chain.headHash, ev.hash);
  } finally {
    cleanup();
  }
});

test('payload hashing is key-order independent', () => {
  assert.equal(canonicalJson({ a: 1, b: [2, { d: 4, c: 3 }] }), canonicalJson({ b: [2, { c: 3, d: 4 }], a: 1 }));
});

test('the same event_id is idempotent and never forks the chain', () => {
  const { db, cleanup } = freshDb();
  try {
    const first = appendEvent(db, { eventId: 'EVT-fixed', type: 'test.dup', actor: 'test' }, fixedClock());
    const second = appendEvent(db, { eventId: 'EVT-fixed', type: 'test.dup', actor: 'test' }, fixedClock());
    assert.equal(second.idempotent, true);
    assert.equal(second.hash, first.hash);
    assert.equal(verifyChain(db).count, 1);
  } finally {
    cleanup();
  }
});

test('the ledger is append-only: update and delete are refused', () => {
  const { db, cleanup } = freshDb();
  try {
    appendEvent(db, { type: 'test.locked', actor: 'test' });
    assert.throws(() => db.exec("UPDATE events SET type = 'tampered' WHERE seq = 1"), /append-only/);
    assert.throws(() => db.exec('DELETE FROM events WHERE seq = 1'), /cannot be deleted/);
    assert.equal(verifyChain(db).ok, true);
  } finally {
    cleanup();
  }
});

test('a tampered payload is detected once the safety trigger is removed', () => {
  const { db, cleanup } = freshDb();
  try {
    appendEvent(db, { type: 'test.a', actor: 'test', payload: { v: 1 } });
    appendEvent(db, { type: 'test.b', actor: 'test', payload: { v: 2 } });
    // Simulates an attacker with direct SQL access dropping the guard first.
    db.exec('DROP TRIGGER trg_events_no_update');
    db.exec(`UPDATE events SET payload = '{"v":99}' WHERE seq = 1`);
    const chain = verifyChain(db);
    assert.equal(chain.ok, false);
    assert.equal(chain.reason, 'HASH_MISMATCH');
    assert.equal(chain.brokenAt, 1);
  } finally {
    cleanup();
  }
});

test('deleting a middle event breaks prev_hash linkage', () => {
  const { db, cleanup } = freshDb();
  try {
    for (const v of [1, 2, 3]) appendEvent(db, { type: 'test.seq', actor: 'test', payload: { v } });
    db.exec('DROP TRIGGER trg_events_no_delete');
    db.exec('DELETE FROM events WHERE seq = 2');
    const chain = verifyChain(db);
    assert.equal(chain.ok, false);
    assert.equal(chain.reason, 'PREV_HASH_MISMATCH');
  } finally {
    cleanup();
  }
});

test('head and readEvents agree with the stored sequence', () => {
  const { db, cleanup } = freshDb();
  try {
    assert.deepEqual(head(db), { seq: 0, hash: ZERO_HASH });
    appendEvent(db, { type: 'test.x', actor: 'test' });
    appendEvent(db, { type: 'test.y', actor: 'test' });
    assert.equal(head(db).seq, 2);
    assert.equal(readEvents(db, 1).length, 1);
  } finally {
    cleanup();
  }
});
