import { nowIso } from './ids.mjs';

const FREE = '';

/**
 * SQLite tolerates one writer at a time; the lease makes that explicit and
 * hands out a monotonic fencing token so a resumed stale worker is rejected.
 * Lease rows are never deleted — releasing or reclaiming only expires them and
 * bumps the token, which is what keeps the token monotonic across restarts.
 */
export function acquireLease(db, resource, holder, ttlMs = 60_000, clock = Date) {
  const now = new Date(clock.now());
  const nowStr = now.toISOString();
  const expires = new Date(now.getTime() + ttlMs).toISOString();
  const current = db.prepare('SELECT * FROM write_leases WHERE resource = ?').get(resource);
  if (current && current.holder !== FREE && current.expires_at > nowStr && current.holder !== holder) {
    return { ok: false, reason: 'HELD', holder: current.holder, fencingToken: current.fencing_token };
  }
  const token = (current?.fencing_token ?? 0) + 1;
  db.prepare(
    `INSERT INTO write_leases (resource, holder, fencing_token, acquired_at, expires_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(resource) DO UPDATE SET holder = excluded.holder, fencing_token = excluded.fencing_token,
       acquired_at = excluded.acquired_at, expires_at = excluded.expires_at`,
  ).run(resource, holder, token, nowStr, expires);
  return { ok: true, fencingToken: token, expiresAt: expires };
}

export function releaseLease(db, resource, holder, clock = Date) {
  const info = db
    .prepare(
      `UPDATE write_leases SET holder = '', expires_at = ?, fencing_token = fencing_token + 1
        WHERE resource = ? AND holder = ?`,
    )
    .run(nowIso(clock), resource, holder);
  return info.changes === 1;
}

export function reclaimExpiredLeases(db, clock = Date) {
  const info = db
    .prepare(
      `UPDATE write_leases SET holder = '', fencing_token = fencing_token + 1
        WHERE expires_at <= ? AND holder <> ''`,
    )
    .run(nowIso(clock));
  return info.changes;
}

export function leaseHolder(db, resource, clock = Date) {
  const row = db.prepare('SELECT * FROM write_leases WHERE resource = ?').get(resource);
  if (!row || row.holder === FREE || row.expires_at <= nowIso(clock)) return null;
  return { holder: row.holder, fencingToken: row.fencing_token, expiresAt: row.expires_at };
}

export function assertFencingToken(db, resource, token) {
  const current = db.prepare('SELECT fencing_token, holder FROM write_leases WHERE resource = ?').get(resource);
  if (!current || current.holder === FREE || current.fencing_token !== token) {
    throw new Error(`YENO_LEASE: stale fencing token for ${resource}`);
  }
  return true;
}
