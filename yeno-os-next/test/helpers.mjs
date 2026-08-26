import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../src/core/db.mjs';
import { migrate } from '../src/core/migrate.mjs';

export const MIGRATIONS = new URL('../migrations', import.meta.url).pathname;

export function tempDir() {
  return mkdtempSync(join(tmpdir(), 'yeno-test-'));
}

export function freshDb(dir = tempDir()) {
  const path = join(dir, 'yeno.db');
  const db = openDb(path);
  migrate(db, MIGRATIONS);
  return { db, path, dir, cleanup: () => {
    try {
      db.close();
    } catch {
      // already closed
    }
    rmSync(dir, { recursive: true, force: true });
  } };
}

export function fixedClock(startIso = '2026-08-26T00:00:00.000Z', stepMs = 1000) {
  let t = Date.parse(startIso);
  return {
    now() {
      const current = t;
      t += stepMs;
      return current;
    },
  };
}

export function futureIso(ms = 3_600_000) {
  return new Date(Date.now() + ms).toISOString();
}

export function pastIso(ms = 3_600_000) {
  return new Date(Date.now() - ms).toISOString();
}
