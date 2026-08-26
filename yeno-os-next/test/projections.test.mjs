import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendEvent } from '../src/core/events.mjs';
import { catchUp, rebuild, snapshotHash } from '../src/core/projections.mjs';
import { canonicalJson } from '../src/core/hash.mjs';
import { freshDb } from './helpers.mjs';

function seed(db) {
  appendEvent(db, { type: 'inbox.recorded', actor: 'test', payload: { inbox_id: 'IN-1', title: 'title only', state: 'BODY_MISSING' } });
  appendEvent(db, { type: 'inbox.recorded', actor: 'test', payload: { inbox_id: 'IN-2', title: 'another', state: 'NEEDS_SOURCE' } });
  appendEvent(db, { type: 'inbox.state_changed', actor: 'test', payload: { inbox_id: 'IN-1', state: 'PARTIAL', attempts: 2 } });
}

test('projections are derived from the ledger and rebuild deterministically', () => {
  const { db, cleanup } = freshDb();
  try {
    seed(db);
    catchUp(db);
    const before = canonicalJson(snapshotHash(db));
    rebuild(db);
    assert.equal(canonicalJson(snapshotHash(db)), before);
    const row = db.prepare('SELECT * FROM proj_inbox_state WHERE inbox_id = ?').get('IN-1');
    assert.equal(row.state, 'PARTIAL');
    assert.equal(row.attempts, 2);
  } finally {
    cleanup();
  }
});

test('a wiped projection is fully recovered from events alone', () => {
  const { db, cleanup } = freshDb();
  try {
    seed(db);
    catchUp(db);
    const expected = canonicalJson(snapshotHash(db));
    db.exec('DELETE FROM proj_inbox_state');
    db.exec("UPDATE projections SET last_seq = 0 WHERE name = 'proj_inbox_state'");
    rebuild(db);
    assert.equal(canonicalJson(snapshotHash(db)), expected);
  } finally {
    cleanup();
  }
});

test('catchUp is incremental and does not reapply old events', () => {
  const { db, cleanup } = freshDb();
  try {
    seed(db);
    const first = catchUp(db);
    assert.equal(first.proj_inbox_state.last_seq, 3);
    const second = catchUp(db);
    assert.equal(second.proj_inbox_state.rows, first.proj_inbox_state.rows);
  } finally {
    cleanup();
  }
});

test('unknown event types are ignored rather than crashing the projector', () => {
  const { db, cleanup } = freshDb();
  try {
    appendEvent(db, { type: 'future.unknown.type', actor: 'test', payload: { anything: true } });
    const result = catchUp(db);
    assert.equal(result.proj_inbox_state.rows, 0);
  } finally {
    cleanup();
  }
});
