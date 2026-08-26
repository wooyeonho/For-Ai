import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sha256 } from './hash.mjs';
import { nowIso } from './ids.mjs';

export const MIGRATIONS_DIR = process.env.YENO_MIGRATIONS ?? 'migrations';

const MIGRATION_NAME = /^\d{4}_[a-z0-9_]+\.sql$/;

export function listMigrations(dir = MIGRATIONS_DIR) {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((filename) => {
      if (!MIGRATION_NAME.test(filename)) {
        throw new Error(`YENO_MIGRATION: bad migration filename ${filename}`);
      }
      const sql = readFileSync(join(dir, filename), 'utf8');
      return { filename, sql, checksum: sha256(sql) };
    });
}

function ensureLedger(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename      TEXT PRIMARY KEY,
    checksum      TEXT NOT NULL,
    applied_order INTEGER NOT NULL UNIQUE,
    applied_at    TEXT NOT NULL
  ) STRICT`);
}

export function appliedMigrations(db) {
  ensureLedger(db);
  return db.prepare('SELECT filename, checksum, applied_order, applied_at FROM schema_migrations ORDER BY applied_order').all();
}

/**
 * An applied migration file may never change again: a checksum mismatch or a
 * disappeared file is drift and stops the process instead of silently healing.
 */
export function assertNoDrift(db, dir = MIGRATIONS_DIR) {
  const onDisk = new Map(listMigrations(dir).map((m) => [m.filename, m]));
  const problems = [];
  for (const row of appliedMigrations(db)) {
    const file = onDisk.get(row.filename);
    if (!file) {
      problems.push(`${row.filename}: applied but missing on disk`);
      continue;
    }
    if (file.checksum !== row.checksum) {
      problems.push(`${row.filename}: checksum drift applied=${row.checksum} disk=${file.checksum}`);
    }
  }
  const appliedOrder = appliedMigrations(db).map((r) => r.filename);
  const diskOrder = [...onDisk.keys()];
  for (let i = 0; i < appliedOrder.length; i += 1) {
    if (diskOrder[i] !== appliedOrder[i]) {
      problems.push(`order drift at position ${i}: applied=${appliedOrder[i]} disk=${diskOrder[i]}`);
      break;
    }
  }
  if (problems.length > 0) {
    throw new Error(`YENO_MIGRATION_DRIFT: ${problems.join(' | ')}`);
  }
  return true;
}

export function migrate(db, dir = MIGRATIONS_DIR, clock = Date) {
  assertNoDrift(db, dir);
  const applied = new Set(appliedMigrations(db).map((r) => r.filename));
  let order = applied.size;
  const newlyApplied = [];
  for (const m of listMigrations(dir)) {
    if (applied.has(m.filename)) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(m.sql);
      db.prepare(
        'INSERT INTO schema_migrations (filename, checksum, applied_order, applied_at) VALUES (?, ?, ?, ?)',
      ).run(m.filename, m.checksum, order, nowIso(clock));
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw new Error(`YENO_MIGRATION: ${m.filename} failed: ${err.message}`);
    }
    order += 1;
    newlyApplied.push(m.filename);
  }
  return newlyApplied;
}
