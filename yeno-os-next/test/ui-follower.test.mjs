// The refresh policy, tested against the real stream. The property under test is
// that a follower cannot show a screen assembled from events it did not see, and
// cannot keep claiming the screen is live when the connection is gone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './helpers.mjs';
import { setStop } from '../src/core/governor.mjs';
import { createServer, LOOPBACK } from '../src/api/server.mjs';
import { Follower, parseFrames } from '../src/ui/follower.mjs';

const TOKEN = 'follower-token-0123456789';

async function withServer(ctx, fn) {
  ctx.db.close();
  const api = createServer({ dbPath: ctx.path, token: TOKEN, pollMs: 20 });
  const address = await api.listen(0);
  const base = `http://${LOOPBACK}:${address.port}`;
  const call = (path, init = {}) =>
    fetch(`${base}${path}`, {
      ...init,
      headers: { 'x-yeno-token': TOKEN, 'content-type': 'application/json', ...(init.headers ?? {}) },
    });
  const remember = (content) =>
    call('/command', {
      method: 'POST',
      body: JSON.stringify({
        command: 'self.remember',
        payload: { kind: 'EPISODIC', content, source_ref: 'test://follower', confidence: 0.9 },
      }),
    });
  try {
    await fn({ call, remember });
  } finally {
    await api.close();
  }
}

async function drain(reader, follower, until) {
  const events = [];
  let refetch = false;
  while (!until(events)) {
    const { value, done } = await reader.read();
    if (done) break;
    const step = follower.feed(Buffer.from(value).toString('utf8'));
    events.push(...step.events);
    refetch = refetch || step.refetch;
  }
  return { events, refetch };
}

test('the follower applies real stream events in ledger order, once each', async () => {
  const ctx = freshDb();
  try {
    setStop(ctx.db, false, 'follower test', 'owner');
    await withServer(ctx, async ({ call, remember }) => {
      const follower = new Follower();
      const stream = await call(`/events/stream${follower.resumeQuery()}`);
      const reader = stream.body.getReader();
      follower.open();
      await remember('first');
      await remember('second');
      const { events } = await drain(reader, follower, (seen) => seen.length >= 4);
      const seqs = events.map((e) => e.seq);
      assert.deepEqual([...seqs].sort((a, b) => a - b), seqs, 'events arrived out of order');
      assert.equal(new Set(seqs).size, seqs.length, 'an event was applied twice');
      assert.ok(events.some((e) => e.type === 'api.command.accepted'));
      assert.equal(follower.lastSeq, Math.max(...seqs));
      await reader.cancel();
    });
  } finally {
    ctx.cleanup();
  }
});

test('resuming from the last seen sequence replays nothing already on screen', async () => {
  const ctx = freshDb();
  try {
    setStop(ctx.db, false, 'follower test', 'owner');
    await withServer(ctx, async ({ call, remember }) => {
      const first = new Follower();
      const s1 = await call(`/events/stream${first.resumeQuery()}`);
      const r1 = s1.body.getReader();
      first.open();
      await remember('before the drop');
      await drain(r1, first, (seen) => seen.length >= 2);
      await r1.cancel();
      const dropped = first.dropped();
      assert.match(dropped.banner, /^stale: DISCONNECTED; last seen event \d+$/);
      assert.equal(first.stale, true);
      assert.equal(first.live, false);

      // Reconnect from where the screen already is.
      const second = new Follower({ from: first.lastSeq });
      assert.equal(second.resumeQuery(), `?from=${first.lastSeq}`);
      // Reopening never claims freshness by itself: the shell refetches first.
      assert.deepEqual(second.open(), { refetch: true });
      const s2 = await call(`/events/stream${second.resumeQuery()}`);
      const r2 = s2.body.getReader();
      await remember('after the drop');
      const { events } = await drain(r2, second, (seen) => seen.length >= 2);
      assert.ok(events.every((e) => e.seq > first.lastSeq), 'the resume replayed a seen event');
      await r2.cancel();
    });
  } finally {
    ctx.cleanup();
  }
});

test('a gap in the stream forces a refetch instead of patching the screen', () => {
  const follower = new Follower({ from: 10 });
  follower.open();
  const frame = (seq) => `id: ${seq}\nevent: t\ndata: ${JSON.stringify({ seq })}\n\n`;
  const contiguous = follower.feed(frame(11));
  assert.equal(contiguous.refetch, false);
  assert.equal(contiguous.events.length, 1);
  // 12 never arrived: the screen cannot be patched from 13 alone.
  const gapped = follower.feed(frame(13));
  assert.equal(gapped.refetch, true);
  assert.equal(follower.lastSeq, 13);
  assert.equal(follower.refetches, 1);
});

test('a repeated or regressing sequence is dropped, never applied twice', () => {
  const follower = new Follower({ from: 0 });
  const frame = (seq) => `id: ${seq}\nevent: t\ndata: ${JSON.stringify({ seq })}\n\n`;
  assert.equal(follower.feed(frame(1)).events.length, 1);
  assert.equal(follower.feed(frame(1)).events.length, 0);
  assert.equal(follower.feed(frame(0)).events.length, 0);
  assert.equal(follower.applied, 1);
  assert.equal(follower.lastSeq, 1);
});

test('a frame split across chunks is applied once, when it is complete', () => {
  const follower = new Follower();
  const whole = `id: 1\nevent: t\ndata: ${JSON.stringify({ seq: 1, note: 'split me' })}\n\n`;
  const half = Math.floor(whole.length / 2);
  assert.deepEqual(follower.feed(whole.slice(0, half)).events, []);
  const done = follower.feed(whole.slice(half));
  assert.equal(done.events.length, 1);
  assert.equal(done.events[0].data.note, 'split me');
  // The open comment is not an event and must not move the cursor.
  const after = new Follower();
  assert.deepEqual(after.feed(': open at 7\n\n').events, []);
  assert.equal(after.lastSeq, 0);
});

test('parseFrames returns the unconsumed remainder rather than guessing', () => {
  const { frames, rest } = parseFrames(`id: 1\nevent: t\ndata: {}\n\nid: 2\nevent`);
  assert.equal(frames.length, 1);
  assert.equal(rest, 'id: 2\nevent');
});
