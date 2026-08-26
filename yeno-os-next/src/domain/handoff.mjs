// Session continuity. A session is a RUN/checkpoint unit, not a scope boundary:
// every checkpoint must leave behind a report and an unblocked NEXT_RUN so the
// following session resumes from the ledger instead of re-planning.
import { appendEvent } from '../core/events.mjs';
import { nowIso, newId } from '../core/ids.mjs';

export function startRun(db, { runRef, gateId, goal, baselineRef, sessionRef = null, authority = 'A2' }, clock = Date) {
  if (!runRef) throw new Error('startRun requires a runRef');
  const existing = db.prepare('SELECT * FROM session_runs WHERE run_ref = ?').get(runRef);
  if (existing) return { ...existing, idempotent: true };

  const ts = nowIso(clock);
  db.prepare(
    `INSERT INTO session_runs (run_ref, gate_id, goal, session_ref, baseline_ref, authority, started_at, state)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'IN_PROGRESS')`,
  ).run(runRef, gateId, goal, sessionRef, baselineRef, authority, ts);
  appendEvent(
    db,
    {
      eventId: `EVT-${runRef}-started`,
      type: 'session.run_started',
      actor: sessionRef ?? 'cli',
      authority,
      payload: { run_ref: runRef, gate_id: gateId, goal, baseline_ref: baselineRef },
    },
    clock,
  );
  return { ...db.prepare('SELECT * FROM session_runs WHERE run_ref = ?').get(runRef), idempotent: false };
}

export function openBlocker(
  db,
  { blockerId, gateId = null, kind, neededFrom, title, detail, workaround = null },
  clock = Date,
) {
  const id = blockerId ?? newId('BLK');
  const existing = db.prepare('SELECT * FROM blockers WHERE blocker_id = ?').get(id);
  if (existing) return { ...existing, idempotent: true };
  const ts = nowIso(clock);
  db.prepare(
    `INSERT INTO blockers (blocker_id, gate_id, kind, needed_from, title, detail, workaround, state, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'WAITING', ?)`,
  ).run(id, gateId, kind, neededFrom, title, detail, workaround, ts);
  appendEvent(
    db,
    {
      eventId: `EVT-${id}-opened`,
      type: 'blocker.opened',
      actor: 'cli',
      authority: 'A1',
      payload: { blocker_id: id, gate_id: gateId, kind, needed_from: neededFrom, title },
    },
    clock,
  );
  return { ...db.prepare('SELECT * FROM blockers WHERE blocker_id = ?').get(id), idempotent: false };
}

export function settleBlocker(db, blockerId, { state = 'RESOLVED', resolution }, clock = Date) {
  if (!resolution) throw new Error('settling a blocker requires a resolution');
  const row = db.prepare('SELECT * FROM blockers WHERE blocker_id = ?').get(blockerId);
  if (!row) throw new Error(`unknown blocker ${blockerId}`);
  if (row.state !== 'WAITING') return { ...row, idempotent: true };
  const ts = nowIso(clock);
  db.prepare('UPDATE blockers SET state = ?, resolution = ?, settled_at = ? WHERE blocker_id = ?').run(
    state,
    resolution,
    ts,
    blockerId,
  );
  appendEvent(
    db,
    {
      eventId: `EVT-${blockerId}-${state.toLowerCase()}`,
      type: 'blocker.settled',
      actor: 'cli',
      authority: 'A2',
      payload: { blocker_id: blockerId, state, resolution },
    },
    clock,
  );
  return { ...db.prepare('SELECT * FROM blockers WHERE blocker_id = ?').get(blockerId), idempotent: false };
}

export function queueNextRun(
  db,
  { nextId, gateId, exactAction, rationale, priority = 0, blockedBy = null, createdBy = 'cli' },
  clock = Date,
) {
  const id = nextId ?? newId('NXT');
  const existing = db.prepare('SELECT * FROM next_run WHERE next_id = ?').get(id);
  if (existing) return { ...existing, idempotent: true };
  const ts = nowIso(clock);
  db.prepare(
    `INSERT INTO next_run (next_id, gate_id, exact_action, rationale, priority, blocked_by, created_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, gateId, exactAction, rationale, priority, blockedBy, ts, createdBy);
  appendEvent(
    db,
    {
      eventId: `EVT-${id}-queued`,
      type: 'next_run.queued',
      actor: createdBy,
      authority: 'A2',
      payload: { next_id: id, gate_id: gateId, exact_action: exactAction, priority, blocked_by: blockedBy },
    },
    clock,
  );
  return { ...db.prepare('SELECT * FROM next_run WHERE next_id = ?').get(id), idempotent: false };
}

/** Pending, unblocked queue entries in the order a session should take them. */
export function pendingNextRuns(db) {
  return db
    .prepare(
      `SELECT n.* FROM next_run n
       LEFT JOIN blockers b ON b.blocker_id = n.blocked_by
       WHERE n.consumed_at IS NULL AND (b.blocker_id IS NULL OR b.state <> 'WAITING')
       ORDER BY n.priority DESC, n.created_at`,
    )
    .all();
}

export function waitingNextRuns(db) {
  return db
    .prepare(
      `SELECT n.*, b.kind AS blocker_kind, b.title AS blocker_title FROM next_run n
       JOIN blockers b ON b.blocker_id = n.blocked_by
       WHERE n.consumed_at IS NULL AND b.state = 'WAITING'
       ORDER BY n.priority DESC, n.created_at`,
    )
    .all();
}

export function takeNextRun(db, runRef, clock = Date) {
  const [next] = pendingNextRuns(db);
  if (!next) return null;
  const ts = nowIso(clock);
  db.prepare('UPDATE next_run SET consumed_at = ?, consumed_by = ? WHERE next_id = ? AND consumed_at IS NULL').run(
    ts,
    runRef,
    next.next_id,
  );
  appendEvent(
    db,
    {
      eventId: `EVT-${next.next_id}-consumed`,
      type: 'next_run.consumed',
      actor: runRef,
      authority: 'A2',
      payload: { next_id: next.next_id, run_ref: runRef, exact_action: next.exact_action },
    },
    clock,
  );
  return db.prepare('SELECT * FROM next_run WHERE next_id = ?').get(next.next_id);
}

/**
 * Closes a session. The DB trigger refuses this unless a report and an
 * unblocked NEXT_RUN exist, so continuity cannot be forgotten.
 */
export function checkpointRun(db, runRef, { report, evidenceRef = null, state = 'CHECKPOINTED' }, clock = Date) {
  const row = db.prepare('SELECT * FROM session_runs WHERE run_ref = ?').get(runRef);
  if (!row) throw new Error(`unknown run ${runRef}`);
  if (row.state !== 'IN_PROGRESS') return { ...row, idempotent: true };
  const ts = nowIso(clock);
  db.prepare('UPDATE session_runs SET state = ?, report = ?, evidence_ref = ?, ended_at = ? WHERE run_ref = ?').run(
    state,
    report,
    evidenceRef,
    ts,
    runRef,
  );
  appendEvent(
    db,
    {
      eventId: `EVT-${runRef}-${state.toLowerCase()}`,
      type: 'session.checkpointed',
      actor: runRef,
      authority: 'A2',
      payload: { run_ref: runRef, state, evidence_ref: evidenceRef, report_len: String(report ?? '').length },
    },
    clock,
  );
  return { ...db.prepare('SELECT * FROM session_runs WHERE run_ref = ?').get(runRef), idempotent: false };
}

/** Everything the next session needs to resume without re-planning. */
export function handoffReport(db) {
  const summary = db.prepare('SELECT * FROM v_handoff').get();
  return {
    ...summary,
    gates: db
      .prepare("SELECT gate_id, state, blocked_reason FROM gates WHERE state <> 'PASSED' ORDER BY ordinal")
      .all(),
    last_runs: db
      .prepare('SELECT run_ref, gate_id, state, goal, started_at, ended_at, evidence_ref FROM session_runs ORDER BY started_at DESC LIMIT 5')
      .all(),
    blockers: db
      .prepare("SELECT blocker_id, kind, needed_from, title, workaround FROM blockers WHERE state = 'WAITING' ORDER BY created_at")
      .all(),
    next_runs: pendingNextRuns(db).map((n) => ({
      next_id: n.next_id,
      gate_id: n.gate_id,
      priority: n.priority,
      exact_action: n.exact_action,
    })),
    next_runs_blocked: waitingNextRuns(db).map((n) => ({
      next_id: n.next_id,
      gate_id: n.gate_id,
      exact_action: n.exact_action,
      blocked_by: n.blocked_by,
      blocker_kind: n.blocker_kind,
    })),
  };
}
