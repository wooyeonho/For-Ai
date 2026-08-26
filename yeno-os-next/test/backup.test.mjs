import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, statSync, openSync, writeSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { createBackup, verifyBackup, restoreBackup } from '../src/core/backup.mjs';
import { appendEvent, verifyChain } from '../src/core/events.mjs';
import { openDb } from '../src/core/db.mjs';
import { freshDb } from './helpers.mjs';

function seed(db, n = 3) {
  for (let i = 0; i < n; i += 1) appendEvent(db, { type: 'test.backup', actor: 'test', payload: { i } });
}

test('a fresh backup verifies and records its manifest', async () => {
  const { db, dir, cleanup } = freshDb();
  try {
    seed(db);
    const backup = await createBackup(db, { dir: join(dir, 'backups') });
    const result = await verifyBackup(backup.path, { liveDb: db });
    assert.equal(result.ok, true, result.problems.join('|'));
    assert.equal(result.manifest.event_count, 3);
    const row = db.prepare('SELECT verify_result FROM backups WHERE backup_id = ?').get(backup.backupId);
    assert.equal(row.verify_result, 'OK');
  } finally {
    cleanup();
  }
});

test('a corrupted backup file is rejected', async () => {
  const { db, dir, cleanup } = freshDb();
  try {
    seed(db);
    const backup = await createBackup(db, { dir: join(dir, 'backups') });
    const size = statSync(backup.path).size;
    const fd = openSync(backup.path, 'r+');
    writeSync(fd, Buffer.from('DEADBEEF'), 0, 8, Math.floor(size / 2));
    closeSync(fd);
    const result = await verifyBackup(backup.path);
    assert.equal(result.ok, false);
    assert.ok(result.problems.some((p) => p.startsWith('DB_HASH_MISMATCH')), result.problems.join('|'));
    await assert.rejects(() => restoreBackup(backup.path, join(dir, 'restored.db')), /YENO_RESTORE_REFUSED/);
  } finally {
    cleanup();
  }
});

test('a tampered manifest is rejected', async () => {
  const { db, dir, cleanup } = freshDb();
  try {
    seed(db);
    const backup = await createBackup(db, { dir: join(dir, 'backups') });
    const manifest = JSON.parse(readFileSync(backup.manifestPath, 'utf8'));
    manifest.event_count = 99;
    writeFileSync(backup.manifestPath, JSON.stringify(manifest));
    const result = await verifyBackup(backup.path);
    assert.equal(result.ok, false);
    assert.ok(result.problems.some((p) => p.startsWith('EVENT_COUNT')), result.problems.join('|'));
  } finally {
    cleanup();
  }
});

test('restore rebuilds a working database in a new file', async () => {
  const { db, dir, cleanup } = freshDb();
  try {
    seed(db, 5);
    const expectedHead = verifyChain(db).headHash;
    const backup = await createBackup(db, { dir: join(dir, 'backups') });
    const target = join(dir, 'restored', 'yeno.db');
    const result = await restoreBackup(backup.path, target);
    assert.equal(result.ok, true);
    assert.equal(result.eventCount, 5);
    assert.equal(result.headHash, expectedHead);

    const restored = openDb(target);
    assert.equal(restored.prepare('SELECT COUNT(*) AS n FROM events').get().n, 5);
    appendEvent(restored, { type: 'test.after_restore', actor: 'test' });
    assert.equal(verifyChain(restored).ok, true);
    restored.close();
  } finally {
    cleanup();
  }
});

test('a backup taken while events keep arriving stays consistent', async () => {
  const { db, dir, cleanup } = freshDb();
  try {
    seed(db, 2);
    const backup = await createBackup(db, { dir: join(dir, 'backups') });
    seed(db, 4);
    const result = await verifyBackup(backup.path);
    assert.equal(result.ok, true, result.problems.join('|'));
    assert.equal(result.manifest.event_count, 2);
    assert.equal(verifyChain(db).count, 6);
  } finally {
    cleanup();
  }
});
