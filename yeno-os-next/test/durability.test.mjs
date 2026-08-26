import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { openDb } from '../src/core/db.mjs';
import { verifyChain } from '../src/core/events.mjs';
import { rebuild, snapshotHash } from '../src/core/projections.mjs';
import { canonicalJson } from '../src/core/hash.mjs';
import { verifyReport } from '../src/domain/status.mjs';
import { tempDir, MIGRATIONS } from './helpers.mjs';

const REPO = new URL('..', import.meta.url).pathname;
const CRASH_WRITER = join(REPO, 'scripts', 'crash-writer.mjs');

function runWriter(dbPath, args) {
  return spawnSync(process.execPath, [CRASH_WRITER, '--db', dbPath, '--migrations', MIGRATIONS, ...args], {
    cwd: REPO,
    encoding: 'utf8',
  });
}

test('a SIGKILLed writer leaves a verifiable ledger and resumes without duplicates', () => {
  const dir = tempDir();
  const dbPath = join(dir, 'yeno.db');

  const killed = runWriter(dbPath, ['--events', '6', '--kill-after', '3']);
  assert.equal(killed.signal, 'SIGKILL');
  assert.match(killed.stdout, /killed-after=3/);

  let db = openDb(dbPath);
  const afterCrash = verifyChain(db);
  assert.equal(afterCrash.ok, true, afterCrash.reason ?? '');
  assert.equal(afterCrash.count, 3);
  const idsAfterCrash = db.prepare('SELECT event_id FROM events ORDER BY seq').all().map((r) => r.event_id);
  db.close();

  // Same command replayed: identical event ids, no forked chain, no duplicates.
  const resumed = runWriter(dbPath, ['--events', '6']);
  assert.equal(resumed.status, 0, resumed.stderr);

  db = openDb(dbPath);
  const final = verifyChain(db);
  assert.equal(final.ok, true);
  assert.equal(final.count, 6);
  const ids = db.prepare('SELECT event_id FROM events ORDER BY seq').all().map((r) => r.event_id);
  assert.deepEqual(ids.slice(0, 3), idsAfterCrash);
  assert.equal(new Set(ids).size, 6);

  const projected = db.prepare('SELECT COUNT(*) AS n FROM proj_inbox_state').get().n;
  assert.equal(projected, 6);
  const before = canonicalJson(snapshotHash(db));
  rebuild(db);
  assert.equal(canonicalJson(snapshotHash(db)), before);
  assert.equal(verifyReport(db, { migrationsDir: MIGRATIONS }).ok, true);
  db.close();
});

test('two concurrent writers do not corrupt the chain', () => {
  const dir = tempDir();
  const dbPath = join(dir, 'yeno.db');
  runWriter(dbPath, ['--events', '1']);

  const a = runWriter(dbPath, ['--events', '20', '--prefix', 'EVT-a']);
  const b = runWriter(dbPath, ['--events', '20', '--prefix', 'EVT-b']);
  assert.equal(a.status, 0, a.stderr);
  assert.equal(b.status, 0, b.stderr);

  const db = openDb(dbPath);
  const chain = verifyChain(db);
  assert.equal(chain.ok, true, `${chain.reason} at ${chain.brokenAt}`);
  assert.equal(chain.count, 41);
  db.close();
});
