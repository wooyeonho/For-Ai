import { readEvents } from './events.mjs';
import { nowIso } from './ids.mjs';

/**
 * Projections are derived state only. Every row here must be reproducible by
 * folding the event ledger from seq 0, so a rebuild is always safe.
 */
const HANDLERS = {
  'inbox.recorded': (db, ev, p) => {
    db.prepare(
      `INSERT INTO proj_inbox_state (inbox_id, title, state, attempts, updated_seq)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(inbox_id) DO UPDATE SET title = excluded.title, state = excluded.state,
         attempts = excluded.attempts, updated_seq = excluded.updated_seq`,
    ).run(p.inbox_id, p.title, p.state ?? 'BODY_MISSING', p.attempts ?? 0, ev.seq);
  },
  'inbox.state_changed': (db, ev, p) => {
    db.prepare(
      `UPDATE proj_inbox_state SET state = ?, attempts = ?, updated_seq = ? WHERE inbox_id = ?`,
    ).run(p.state, p.attempts ?? 0, ev.seq, p.inbox_id);
  },
  'run.created': (db, ev, p) => {
    db.prepare(
      `INSERT INTO proj_run_state (run_id, goal, state, updated_seq) VALUES (?, ?, ?, ?)
       ON CONFLICT(run_id) DO UPDATE SET goal = excluded.goal, state = excluded.state,
         updated_seq = excluded.updated_seq`,
    ).run(p.run_id, p.goal, p.state ?? 'PENDING', ev.seq);
  },
  'run.state_changed': (db, ev, p) => {
    db.prepare('UPDATE proj_run_state SET state = ?, updated_seq = ? WHERE run_id = ?').run(
      p.state,
      ev.seq,
      p.run_id,
    );
  },
};

export const PROJECTION_NAMES = ['proj_inbox_state', 'proj_run_state'];

export function applyEvents(db, events) {
  let applied = 0;
  for (const ev of events) {
    const handler = HANDLERS[ev.type];
    if (!handler) continue;
    handler(db, ev, JSON.parse(ev.payload));
    applied += 1;
  }
  return applied;
}

export function catchUp(db, clock = Date) {
  const results = {};
  for (const name of PROJECTION_NAMES) {
    const meta = db.prepare('SELECT last_seq FROM projections WHERE name = ?').get(name);
    const from = meta?.last_seq ?? 0;
    const events = readEvents(db, from);
    applyEvents(db, events);
    const last = events.length > 0 ? events[events.length - 1].seq : from;
    const rows = db.prepare(`SELECT COUNT(*) AS n FROM ${name}`).get().n;
    db.prepare('UPDATE projections SET last_seq = ?, rows_built = ?, rebuilt_at = ? WHERE name = ?').run(
      last,
      rows,
      nowIso(clock),
      name,
    );
    results[name] = { last_seq: last, rows };
  }
  return results;
}

export function rebuild(db, clock = Date) {
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const name of PROJECTION_NAMES) {
      db.exec(`DELETE FROM ${name}`);
      db.prepare('UPDATE projections SET last_seq = 0, rows_built = 0 WHERE name = ?').run(name);
    }
    const result = catchUp(db, clock);
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function snapshotHash(db) {
  const rows = [];
  for (const name of PROJECTION_NAMES) {
    const pk = name === 'proj_inbox_state' ? 'inbox_id' : 'run_id';
    for (const row of db.prepare(`SELECT * FROM ${name} ORDER BY ${pk}`).all()) {
      rows.push({ table: name, ...row });
    }
  }
  return rows;
}
