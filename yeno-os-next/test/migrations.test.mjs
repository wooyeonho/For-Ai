import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { openDb } from '../src/core/db.mjs';
import { migrate, assertNoDrift, listMigrations, appliedMigrations } from '../src/core/migrate.mjs';
import { sha256 } from '../src/core/hash.mjs';
import { freshDb, tempDir, MIGRATIONS } from './helpers.mjs';

test('pinned checksums match the migration files on disk', () => {
  const pinned = JSON.parse(readFileSync(join(MIGRATIONS, 'CHECKSUMS.json'), 'utf8'));
  for (const m of listMigrations(MIGRATIONS)) {
    assert.equal(m.checksum, pinned[m.filename], `${m.filename} checksum changed; applied migrations are immutable`);
  }
  assert.equal(Object.keys(pinned).length, listMigrations(MIGRATIONS).length);
});

test('migrate is idempotent and records checksums in order', () => {
  const { db, cleanup } = freshDb();
  try {
    assert.deepEqual(migrate(db, MIGRATIONS), []);
    const applied = appliedMigrations(db);
    assert.equal(applied[0].filename, '0001_core.sql');
    assert.equal(applied[0].applied_order, 0);
    assert.equal(applied[1].applied_order, 1);
  } finally {
    cleanup();
  }
});

test('editing an applied migration is detected as drift', () => {
  const dir = tempDir();
  const migDir = join(dir, 'migrations');
  mkdirSync(migDir, { recursive: true });
  for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql'))) {
    copyFileSync(join(MIGRATIONS, f), join(migDir, f));
  }
  const db = openDb(join(dir, 'yeno.db'));
  migrate(db, migDir);

  const target = join(migDir, '0001_core.sql');
  writeFileSync(target, `${readFileSync(target, 'utf8')}\n-- tampered\n`);

  assert.throws(() => assertNoDrift(db, migDir), /YENO_MIGRATION_DRIFT/);
  assert.throws(() => migrate(db, migDir), /YENO_MIGRATION_DRIFT/);
  db.close();
});

test('a removed applied migration is drift, not a silent heal', () => {
  const dir = tempDir();
  const migDir = join(dir, 'migrations');
  mkdirSync(migDir, { recursive: true });
  copyFileSync(join(MIGRATIONS, '0001_core.sql'), join(migDir, '0001_core.sql'));
  const db = openDb(join(dir, 'yeno.db'));
  migrate(db, migDir);
  writeFileSync(join(migDir, '0001_core.sql'), 'SELECT 1;');
  assert.throws(() => assertNoDrift(db, migDir), /checksum drift/);
  db.close();
});

test('a rebuilt database from the same migrations has identical checksums', () => {
  const a = freshDb();
  const b = freshDb();
  try {
    const ca = appliedMigrations(a.db).map((m) => m.checksum);
    const cb = appliedMigrations(b.db).map((m) => m.checksum);
    assert.deepEqual(ca, cb);
    assert.equal(ca[0], sha256(readFileSync(join(MIGRATIONS, '0001_core.sql'), 'utf8')));
  } finally {
    a.cleanup();
    b.cleanup();
  }
});
