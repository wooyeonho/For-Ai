import { canonicalJson, sha256, ZERO_HASH } from './hash.mjs';
import { newId, nowIso } from './ids.mjs';

export function eventHash({ prevHash, eventId, ts, type, actor, authority, payload }) {
  return sha256(
    canonicalJson({
      prev_hash: prevHash,
      event_id: eventId,
      ts,
      type,
      actor,
      authority,
      payload: canonicalJson(payload),
    }),
  );
}

export function head(db) {
  const row = db.prepare('SELECT seq, hash FROM events ORDER BY seq DESC LIMIT 1').get();
  return row ?? { seq: 0, hash: ZERO_HASH };
}

/**
 * Appends one event to the ledger. Idempotent on event_id: replaying the same
 * command with the same event_id returns the stored event instead of forking
 * the chain.
 */
export function appendEvent(db, { eventId, type, actor, authority = 'A1', payload = {} }, clock = Date) {
  const id = eventId ?? newId('EVT');
  const existing = db.prepare('SELECT * FROM events WHERE event_id = ?').get(id);
  if (existing) return { ...existing, idempotent: true };

  const ts = nowIso(clock);
  const prev = head(db);
  const hash = eventHash({ prevHash: prev.hash, eventId: id, ts, type, actor, authority, payload });
  db.prepare(
    `INSERT INTO events (event_id, ts, type, actor, authority, payload, prev_hash, hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, ts, type, actor, authority, canonicalJson(payload), prev.hash, hash);
  const row = db.prepare('SELECT * FROM events WHERE event_id = ?').get(id);
  return { ...row, idempotent: false };
}

export function readEvents(db, fromSeq = 0) {
  return db.prepare('SELECT * FROM events WHERE seq > ? ORDER BY seq').all(fromSeq);
}

export function verifyChain(db) {
  const rows = readEvents(db, 0);
  let prevHash = ZERO_HASH;
  let expectedSeq = 0;
  let contiguous = true;
  for (const row of rows) {
    expectedSeq += 1;
    if (row.seq !== expectedSeq) contiguous = false;
    if (row.prev_hash !== prevHash) {
      return { ok: false, count: rows.length, brokenAt: row.seq, reason: 'PREV_HASH_MISMATCH' };
    }
    const recomputed = eventHash({
      prevHash: row.prev_hash,
      eventId: row.event_id,
      ts: row.ts,
      type: row.type,
      actor: row.actor,
      authority: row.authority,
      payload: JSON.parse(row.payload),
    });
    if (recomputed !== row.hash) {
      return { ok: false, count: rows.length, brokenAt: row.seq, reason: 'HASH_MISMATCH' };
    }
    prevHash = row.hash;
  }
  return { ok: contiguous, count: rows.length, headHash: prevHash, contiguous, reason: contiguous ? null : 'SEQ_GAP' };
}
