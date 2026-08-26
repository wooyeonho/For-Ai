import { copyFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { openDb, integrityCheck } from './db.mjs';
import { appliedMigrations } from './migrate.mjs';
import { verifyChain, head } from './events.mjs';
import { canonicalJson, sha256, sha256File } from './hash.mjs';
import { newId, nowIso } from './ids.mjs';

export const DEFAULT_BACKUP_DIR = process.env.YENO_BACKUP_DIR ?? 'backups';

function manifestPath(dbPath) {
  return `${dbPath}.manifest.json`;
}

function collectManifest(db, { dbPath, dbHash, sizeBytes, createdAt }) {
  const chain = verifyChain(db);
  return {
    kind: 'yeno-backup-manifest',
    version: 1,
    db_path: dbPath,
    db_sha256: dbHash,
    size_bytes: sizeBytes,
    created_at: createdAt,
    event_count: chain.count,
    event_head_hash: head(db).hash,
    migrations: appliedMigrations(db).map((m) => ({ filename: m.filename, checksum: m.checksum })),
  };
}

/**
 * VACUUM INTO writes a transactionally consistent copy, so a backup taken
 * while the kernel is running is never a torn file.
 */
export async function createBackup(db, { dir = DEFAULT_BACKUP_DIR, clock = Date } = {}) {
  mkdirSync(dir, { recursive: true });
  const createdAt = nowIso(clock);
  const backupId = newId('BKP');
  const target = resolve(join(dir, `${backupId}.db`));
  db.prepare('VACUUM INTO ?').run(target);

  const dbHash = await sha256File(target);
  const sizeBytes = statSync(target).size;
  const copy = openDb(target, { readOnly: true });
  let manifest;
  try {
    manifest = collectManifest(copy, { dbPath: target, dbHash, sizeBytes, createdAt });
  } finally {
    copy.close();
  }
  const manifestJson = canonicalJson(manifest);
  writeFileSync(manifestPath(target), `${manifestJson}\n`);
  const manifestHash = sha256(manifestJson);

  db.prepare(
    `INSERT INTO backups (backup_id, path, db_sha256, manifest_sha256, event_head_hash, event_count, size_bytes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(backupId, target, dbHash, manifestHash, manifest.event_head_hash, manifest.event_count, sizeBytes, createdAt);

  return { backupId, path: target, manifestPath: manifestPath(target), dbHash, manifestHash, manifest };
}

export async function verifyBackup(path, { liveDb = null, clock = Date } = {}) {
  const problems = [];
  const abs = resolve(path);
  let manifest = null;
  try {
    manifest = JSON.parse(readFileSync(manifestPath(abs), 'utf8'));
  } catch (err) {
    problems.push(`MANIFEST_UNREADABLE: ${err.message}`);
  }

  let actualHash = null;
  try {
    actualHash = await sha256File(abs);
  } catch (err) {
    problems.push(`DB_UNREADABLE: ${err.message}`);
  }
  if (manifest && actualHash && manifest.db_sha256 !== actualHash) {
    problems.push(`DB_HASH_MISMATCH: manifest=${manifest.db_sha256} actual=${actualHash}`);
  }

  if (actualHash) {
    let copy = null;
    try {
      copy = openDb(abs, { readOnly: true });
      const integrity = integrityCheck(copy);
      if (integrity !== 'ok') problems.push(`INTEGRITY_CHECK: ${integrity}`);
      const chain = verifyChain(copy);
      if (!chain.ok) problems.push(`EVENT_CHAIN: ${chain.reason} at seq ${chain.brokenAt ?? '?'}`);
      if (manifest) {
        if (chain.count !== manifest.event_count) {
          problems.push(`EVENT_COUNT: manifest=${manifest.event_count} actual=${chain.count}`);
        }
        const actualHead = head(copy).hash;
        if (actualHead !== manifest.event_head_hash) {
          problems.push(`EVENT_HEAD: manifest=${manifest.event_head_hash} actual=${actualHead}`);
        }
        const applied = appliedMigrations(copy).map((m) => `${m.filename}:${m.checksum}`).join(',');
        const expected = manifest.migrations.map((m) => `${m.filename}:${m.checksum}`).join(',');
        if (applied !== expected) problems.push('MIGRATIONS_MISMATCH');
      }
    } catch (err) {
      problems.push(`OPEN_FAILED: ${err.message}`);
    } finally {
      copy?.close();
    }
  }

  const result = { ok: problems.length === 0, path: abs, problems, manifest };
  if (liveDb) {
    liveDb
      .prepare('UPDATE backups SET verified_at = ?, verify_result = ? WHERE path = ?')
      .run(nowIso(clock), result.ok ? 'OK' : 'FAILED', abs);
  }
  return result;
}

export async function restoreBackup(backupPath, targetPath, { force = false } = {}) {
  const verification = await verifyBackup(backupPath);
  if (!verification.ok && !force) {
    throw new Error(`YENO_RESTORE_REFUSED: ${verification.problems.join(' | ')}`);
  }
  mkdirSync(dirname(resolve(targetPath)), { recursive: true });
  copyFileSync(resolve(backupPath), resolve(targetPath));
  const restored = openDb(resolve(targetPath), { readOnly: true });
  try {
    const chain = verifyChain(restored);
    const integrity = integrityCheck(restored);
    return {
      ok: chain.ok && integrity === 'ok',
      target: resolve(targetPath),
      eventCount: chain.count,
      headHash: chain.headHash ?? null,
      integrity,
    };
  } finally {
    restored.close();
  }
}
