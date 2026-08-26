import { newId, nowIso } from '../core/ids.mjs';

export const REQUIRED_PROBE_KINDS = [
  'CRASH_REPLAY',
  'CHAIN_VERIFY',
  'PROJECTION_DETERMINISM',
  'INTEGRITY',
  'BACKUP_RESTORE',
  'LEASE_FENCING',
];

/**
 * A soak session is the durability claim for G1: repeated append -> SIGKILL ->
 * restart -> replay -> verify -> backup -> restore cycles, each writing its own
 * probe rows. The session is opened RUNNING so an interrupted soak stays
 * visible as unfinished instead of vanishing.
 */
export function startSoak(
  db,
  { soakId, gateId = 'G1', runRef = null, plannedCycles, host = 'local-wsl' },
  clock = Date,
) {
  if (!Number.isInteger(plannedCycles) || plannedCycles < 1) {
    throw new Error('YENO_SOAK: plannedCycles must be a positive integer');
  }
  const id = soakId ?? newId('SOAK');
  db.prepare(
    `INSERT INTO soak_sessions (soak_id, gate_id, run_ref, host, node_version, planned_cycles, started_at, state)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'RUNNING')`,
  ).run(id, gateId, runRef, host, process.version, plannedCycles, nowIso(clock));
  return id;
}

export function recordProbe(db, soakId, { cycle, kind, ok, detail, durationMs = 0 }, clock = Date) {
  if (!REQUIRED_PROBE_KINDS.includes(kind)) throw new Error(`YENO_SOAK: unknown probe kind ${kind}`);
  const probeId = newId('PRB');
  db.prepare(
    `INSERT INTO durability_probes (probe_id, soak_id, cycle, kind, ok, detail, observed_at, duration_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(probeId, soakId, cycle, kind, ok ? 1 : 0, detail, nowIso(clock), Math.max(0, Math.round(durationMs)));
  return probeId;
}

export function noteCycle(db, soakId, { kills = 0, restores = 0, events = 0 } = {}) {
  db.prepare(
    `UPDATE soak_sessions
        SET completed_cycles = completed_cycles + 1,
            kill_count = kill_count + ?,
            restore_count = restore_count + ?,
            events_appended = events_appended + ?
      WHERE soak_id = ?`,
  ).run(kills, restores, events, soakId);
}

/**
 * Only the probe rows decide the outcome. A caller cannot pass PASSED in: the
 * outcome is derived here and the schema trigger re-checks it independently.
 */
export function finishSoak(db, soakId, { headHash, evidenceRef, aborted = false, failure = null }, clock = Date) {
  const session = db.prepare('SELECT * FROM soak_sessions WHERE soak_id = ?').get(soakId);
  if (!session) throw new Error(`YENO_SOAK: unknown soak ${soakId}`);
  const summary = db.prepare('SELECT * FROM v_durability WHERE soak_id = ?').get(soakId);

  const reasons = [];
  if (summary.probes_failed > 0) reasons.push(`${summary.probes_failed} probes failed`);
  if (session.completed_cycles < session.planned_cycles) {
    reasons.push(`only ${session.completed_cycles}/${session.planned_cycles} cycles completed`);
  }
  if (session.kill_count === 0) reasons.push('no process was SIGKILLed');
  if (session.restore_count === 0) reasons.push('no backup was restored');
  const missing = REQUIRED_PROBE_KINDS.filter(
    (kind) => db.prepare('SELECT COUNT(*) AS n FROM durability_probes WHERE soak_id = ? AND kind = ?').get(soakId, kind).n === 0,
  );
  if (missing.length > 0) reasons.push(`probe kinds never exercised: ${missing.join(', ')}`);

  // Durability is claimed per cycle, so every planned cycle must carry a full
  // passing probe set, not just the session as a whole.
  const thinCycles = db
    .prepare(
      `SELECT cycle, COUNT(*) AS n FROM durability_probes
        WHERE soak_id = ? AND ok = 1 GROUP BY cycle HAVING n < ?`,
    )
    .all(soakId, REQUIRED_PROBE_KINDS.length)
    .map((r) => r.cycle);
  if (thinCycles.length > 0) reasons.push(`cycles with an incomplete probe set: ${thinCycles.join(', ')}`);
  if (failure) reasons.push(failure);

  const state = aborted ? 'ABORTED' : reasons.length === 0 ? 'PASSED' : 'FAILED';
  const endedAt = nowIso(clock);
  db.prepare(
    `UPDATE soak_sessions
        SET state = ?, ended_at = ?, duration_ms = ?, head_hash = ?, evidence_ref = ?, failure = ?
      WHERE soak_id = ?`,
  ).run(
    state,
    endedAt,
    Math.max(0, Date.parse(endedAt) - Date.parse(session.started_at)),
    headHash ?? null,
    evidenceRef ?? null,
    reasons.length > 0 ? reasons.join('; ') : null,
    soakId,
  );
  return { state, reasons };
}

export function soakReport(db, soakId = null) {
  const sessions = soakId
    ? [db.prepare('SELECT * FROM v_durability WHERE soak_id = ?').get(soakId)].filter(Boolean)
    : db.prepare('SELECT * FROM v_durability ORDER BY soak_id').all();
  return {
    generated_at: new Date().toISOString(),
    required_probe_kinds: REQUIRED_PROBE_KINDS,
    passed_sessions: db.prepare("SELECT COUNT(*) AS n FROM soak_sessions WHERE state = 'PASSED'").get().n,
    sessions: sessions.map((s) => ({
      ...s,
      probes_by_kind: db
        .prepare(
          `SELECT kind, COUNT(*) AS runs, SUM(ok) AS passed, MAX(duration_ms) AS worst_ms
             FROM durability_probes WHERE soak_id = ? GROUP BY kind ORDER BY kind`,
        )
        .all(s.soak_id),
      failures: db
        .prepare('SELECT cycle, kind, detail FROM durability_probes WHERE soak_id = ? AND ok = 0 ORDER BY cycle')
        .all(s.soak_id),
    })),
  };
}

/** The soak evidence G1 is allowed to rely on, if any exists yet. */
export function durabilityEvidence(db) {
  return db
    .prepare(
      `SELECT * FROM v_durability
        WHERE state = 'PASSED' AND probes_failed = 0 AND kill_count > 0 AND restore_count > 0
        ORDER BY completed_cycles DESC, duration_ms DESC LIMIT 1`,
    )
    .get() ?? null;
}
