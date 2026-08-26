import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const DEFAULT_DB_PATH = process.env.YENO_DB ?? 'state/yeno.db';

export function openDb(path = DEFAULT_DB_PATH, { readOnly = false } = {}) {
  if (!readOnly) mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path, { readOnly });
  db.exec('PRAGMA foreign_keys = ON');
  if (!readOnly) {
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA synchronous = FULL');
    db.exec('PRAGMA busy_timeout = 5000');
  }
  return db;
}

export function integrityCheck(db) {
  const rows = db.prepare('PRAGMA integrity_check').all();
  return rows.map((r) => Object.values(r)[0]).join('; ');
}

export function inTransaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // rollback of an already-aborted transaction is not an additional failure
    }
    throw err;
  }
}
