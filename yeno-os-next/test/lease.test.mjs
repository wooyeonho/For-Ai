import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  acquireLease,
  releaseLease,
  reclaimExpiredLeases,
  assertFencingToken,
  leaseHolder,
} from '../src/core/lease.mjs';
import { freshDb } from './helpers.mjs';

test('only one writer holds the lease at a time', () => {
  const { db, cleanup } = freshDb();
  try {
    const first = acquireLease(db, 'state/yeno.db', 'worker-a');
    assert.equal(first.ok, true);
    const second = acquireLease(db, 'state/yeno.db', 'worker-b');
    assert.equal(second.ok, false);
    assert.equal(second.reason, 'HELD');
    assert.equal(leaseHolder(db, 'state/yeno.db').holder, 'worker-a');
  } finally {
    cleanup();
  }
});

test('a stuck lease is reclaimable and the old fencing token goes stale', () => {
  const { db, cleanup } = freshDb();
  try {
    const first = acquireLease(db, 'state/yeno.db', 'worker-a', -1);
    assert.equal(assertFencingToken(db, 'state/yeno.db', first.fencingToken), true);

    assert.equal(reclaimExpiredLeases(db), 1);
    assert.equal(leaseHolder(db, 'state/yeno.db'), null);

    const second = acquireLease(db, 'state/yeno.db', 'worker-b');
    assert.equal(second.ok, true);
    assert.ok(second.fencingToken > first.fencingToken);
    assert.throws(() => assertFencingToken(db, 'state/yeno.db', first.fencingToken), /stale fencing token/);
    assert.equal(assertFencingToken(db, 'state/yeno.db', second.fencingToken), true);
  } finally {
    cleanup();
  }
});

test('release only works for the holder and makes the token stale', () => {
  const { db, cleanup } = freshDb();
  try {
    const held = acquireLease(db, 'state/yeno.db', 'worker-a');
    assert.equal(releaseLease(db, 'state/yeno.db', 'worker-b'), false);
    assert.equal(releaseLease(db, 'state/yeno.db', 'worker-a'), true);
    assert.throws(() => assertFencingToken(db, 'state/yeno.db', held.fencingToken), /stale fencing token/);
    assert.equal(acquireLease(db, 'state/yeno.db', 'worker-b').ok, true);
  } finally {
    cleanup();
  }
});

test('fencing tokens stay monotonic across many handovers', () => {
  const { db, cleanup } = freshDb();
  try {
    let last = 0;
    for (let i = 0; i < 5; i += 1) {
      const lease = acquireLease(db, 'state/yeno.db', `worker-${i}`, 1000);
      assert.ok(lease.fencingToken > last, `${lease.fencingToken} > ${last}`);
      last = lease.fencingToken;
      releaseLease(db, 'state/yeno.db', `worker-${i}`);
    }
  } finally {
    cleanup();
  }
});
