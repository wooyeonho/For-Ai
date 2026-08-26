// The local facade. The properties under test are the ones that decide whether a
// desktop shell can be trusted on top of it: loopback only, no token no answer,
// reads cannot write, writes go through the governor, and the stop closes the
// door for every command.
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { freshDb } from './helpers.mjs';
import { openDb } from '../src/core/db.mjs';
import { setStop, stopEngaged } from '../src/core/governor.mjs';
import { createServer, COMMANDS, runCommand, LOOPBACK } from '../src/api/server.mjs';

const TOKEN = 'test-token-0123456789';

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
  try {
    await fn({ api, address, base, call });
  } finally {
    await api.close();
  }
}

test('the facade binds loopback only and refuses a request with no token', async () => {
  const ctx = freshDb();
  try {
    await withServer(ctx, async ({ address, base, call }) => {
      assert.equal(address.address, LOOPBACK);
      const anonymous = await fetch(`${base}/health`);
      assert.equal(anonymous.status, 401);
      const wrong = await fetch(`${base}/health`, { headers: { 'x-yeno-token': 'nope' } });
      assert.equal(wrong.status, 401);
      assert.equal((await call('/health')).status, 200);
    });
  } finally {
    ctx.cleanup();
  }
});

test('a token is not enough: an unlisted origin is still refused', async () => {
  const ctx = freshDb();
  try {
    await withServer(ctx, async ({ call }) => {
      const evil = await call('/health', { headers: { origin: 'https://example.com' } });
      assert.equal(evil.status, 403);
      const shell = await call('/health', { headers: { origin: 'tauri://localhost' } });
      assert.equal(shell.status, 200);
    });
  } finally {
    ctx.cleanup();
  }
});

test('the read routes serve the Mission Control panels and refuse an invented one', async () => {
  const ctx = freshDb();
  try {
    await withServer(ctx, async ({ call }) => {
      const all = await (await call('/panels?limit=1')).json();
      assert.equal(all.acceptance.ok, true);
      assert.equal(Object.keys(all.panels).length, 8);
      const settings = await (await call('/panel/settings')).json();
      assert.equal(settings.rows[0].emergency_stop_engaged, 1);
      assert.equal((await call('/panel/../secrets')).status, 404);
      assert.equal((await call('/panel/wallet')).status, 404);
    });
  } finally {
    ctx.cleanup();
  }
});

test('no HTTP request can reach a write while the emergency stop is engaged', async () => {
  const ctx = freshDb();
  try {
    assert.equal(stopEngaged(ctx.db), true);
    await withServer(ctx, async ({ call }) => {
      const refused = await call('/command', {
        method: 'POST',
        body: JSON.stringify({
          command: 'self.observe',
          payload: { metric: 'waiting_blockers', value: 3 },
        }),
      });
      assert.equal(refused.status, 423);
      assert.equal((await refused.json()).error, 'EMERGENCY_STOP');
    });
  } finally {
    ctx.cleanup();
  }
});

test('an accepted command lands as an effect and an audit event in the same transaction', async () => {
  const ctx = freshDb();
  try {
    setStop(ctx.db, false, 'api test', 'owner');
    const before = ctx.db.prepare('SELECT COUNT(*) AS n FROM events').get().n;
    await withServer(ctx, async ({ call }) => {
      const response = await call('/command', {
        method: 'POST',
        body: JSON.stringify({
          command: 'self.observe',
          payload: { metric: 'waiting_blockers', value: 2 },
        }),
      });
      assert.equal(response.status, 202);
      const body = await response.json();
      assert.match(body.request_id, /[0-9a-f-]{36}/);
      assert.equal(body.result.value, 2);
    });
    const check = openDb(ctx.path, { readOnly: true });
    const after = check.prepare('SELECT COUNT(*) AS n FROM events').get().n;
    assert.equal(after, before + 1);
    const audit = check
      .prepare("SELECT * FROM events WHERE type = 'api.command.accepted' ORDER BY seq DESC LIMIT 1")
      .get();
    assert.equal(JSON.parse(audit.payload).command, 'self.observe');
    check.close();
  } finally {
    ctx.cleanup();
  }
});

test('an unknown command cannot be smuggled in and a bad payload is refused, not guessed', async () => {
  const ctx = freshDb();
  try {
    setStop(ctx.db, false, 'api test', 'owner');
    await withServer(ctx, async ({ call }) => {
      const invented = await call('/command', {
        method: 'POST',
        body: JSON.stringify({ command: 'db.exec', payload: { sql: 'DELETE FROM events' } }),
      });
      assert.equal(invented.status, 400);
      const incomplete = await call('/command', {
        method: 'POST',
        body: JSON.stringify({ command: 'self.observe', payload: { value: 1 } }),
      });
      assert.equal(incomplete.status, 400);
      assert.match((await incomplete.json()).detail, /missing field metric/);
      const unknownMetric = await call('/command', {
        method: 'POST',
        body: JSON.stringify({ command: 'self.observe', payload: { metric: 'invented', value: 1 } }),
      });
      assert.equal(unknownMetric.status, 422);
    });
    const check = openDb(ctx.path, { readOnly: true });
    assert.equal(
      check.prepare("SELECT COUNT(*) AS n FROM events WHERE type = 'api.command.accepted'").get().n,
      0,
    );
    check.close();
  } finally {
    ctx.cleanup();
  }
});

test('the event stream is the ledger, and a command shows up on it', async () => {
  const ctx = freshDb();
  try {
    setStop(ctx.db, false, 'api test', 'owner');
    await withServer(ctx, async ({ call }) => {
      const stream = await call('/events/stream');
      const reader = stream.body.getReader();
      await call('/command', {
        method: 'POST',
        body: JSON.stringify({
          command: 'self.remember',
          payload: {
            kind: 'EPISODIC',
            content: 'the shell asked the kernel to remember something',
            source_ref: 'test://api',
            confidence: 0.9,
          },
        }),
      });
      let text = '';
      while (!text.includes('api.command.accepted')) {
        const { value, done } = await reader.read();
        if (done) break;
        text += Buffer.from(value).toString('utf8');
      }
      assert.match(text, /event: api\.command\.accepted/);
      await reader.cancel();
    });
  } finally {
    ctx.cleanup();
  }
});

test('the command vocabulary is closed and every entry is a domain call, not SQL', () => {
  const src = readFileSync(new URL('../src/api/server.mjs', import.meta.url), 'utf8');
  assert.deepEqual(Object.keys(COMMANDS).sort(), ['self.observe', 'self.remember']);
  // The facade must not carry its own SQL: writes belong to the domain modules.
  const stripped = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const forbidden of ['INSERT INTO', 'UPDATE ', 'DELETE FROM', 'DROP ']) {
    assert.equal(stripped.includes(forbidden), false, `facade contains ${forbidden}`);
  }
  assert.equal(typeof runCommand, 'function');
});
