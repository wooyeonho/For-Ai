/**
 * Mission Control read model (G8, read side).
 *
 * The desktop shell is not built yet — it needs a Rust toolchain this machine
 * does not have — but the shell's only legitimate job is already definable: run
 * these queries and draw the rows. So this module is deliberately the whole
 * read surface, and deliberately incapable of anything else:
 *
 *   - every panel is one parameterless SELECT over a view from 0017;
 *   - nothing here writes, so the UI process can hold a read-only handle;
 *   - `panels()` returns the same object for the same ledger, so two processes
 *     rendering the same database cannot disagree about what is true.
 *
 * A panel that cannot be answered from the views is a panel that would have had
 * to invent state. Those are listed as gaps in the evidence, not faked here.
 */

export const PANELS = [
  'inbox',
  'projects',
  'timeline',
  'council',
  'approvals',
  'evidence',
  'costs',
  'settings',
];

const DEFAULT_LIMIT = 50;

/** Panel definitions: view + ordering + how many rows a screen shows. */
const PANEL_QUERIES = {
  inbox: {
    view: 'v_mc_inbox',
    order: 'has_body ASC, attempts DESC, inbox_id ASC',
    limit: DEFAULT_LIMIT,
  },
  projects: {
    view: 'v_mc_projects',
    order: 'cycles_useful DESC, priority_display DESC, code ASC',
    limit: DEFAULT_LIMIT,
  },
  timeline: { view: 'v_mc_timeline', order: 'seq DESC', limit: DEFAULT_LIMIT },
  council: { view: 'v_mc_council', order: 'goal_id DESC', limit: DEFAULT_LIMIT },
  approvals: { view: 'v_mc_approvals', order: 'created_at DESC', limit: DEFAULT_LIMIT },
  evidence: { view: 'v_mc_evidence', order: 'at DESC, kind ASC, ref_id ASC', limit: DEFAULT_LIMIT },
  costs: { view: 'v_mc_costs', order: 'active DESC, monthly_limit_krw ASC', limit: DEFAULT_LIMIT },
  settings: { view: 'v_mc_settings', order: null, limit: 1 },
};

/**
 * Headline numbers per panel. These are counts of the things the Owner has to
 * act on, not of everything, because a badge showing "34" for a panel where
 * nothing needs attention trains the Owner to ignore badges.
 */
const ATTENTION = {
  inbox: 'SELECT COUNT(*) AS n FROM v_mc_inbox WHERE has_body = 0',
  projects: 'SELECT COUNT(*) AS n FROM v_mc_projects WHERE cycles = 0',
  timeline: 'SELECT 0 AS n',
  council: "SELECT COUNT(*) AS n FROM v_mc_council WHERE decision IS NULL OR constitution_ok = 0",
  approvals: "SELECT COUNT(*) AS n FROM v_mc_approvals WHERE state = 'LIVE'",
  evidence: 'SELECT COUNT(*) AS n FROM v_mc_evidence WHERE evidence_ref IS NULL',
  costs: 'SELECT COUNT(*) AS n FROM v_mc_costs WHERE remaining_krw <= 0',
  settings: 'SELECT COUNT(*) AS n FROM v_mc_settings WHERE emergency_stop_engaged = 1',
};

export function panelNames() {
  return [...PANELS];
}

export function panel(db, name, { limit = null } = {}) {
  const spec = PANEL_QUERIES[name];
  if (!spec) throw new Error(`MISSION_CONTROL: unknown panel ${name}`);
  const cap = limit ?? spec.limit;
  const order = spec.order ? ` ORDER BY ${spec.order}` : '';
  const rows = db.prepare(`SELECT * FROM ${spec.view}${order} LIMIT ${Number(cap)}`).all();
  const total = db.prepare(`SELECT COUNT(*) AS n FROM ${spec.view}`).get().n;
  const attention = db.prepare(ATTENTION[name]).get().n;
  return { panel: name, view: spec.view, total, shown: rows.length, attention, rows };
}

/**
 * The whole surface in one read. `head_seq` is included so a caller can tell
 * whether two panels were drawn from the same ledger state.
 */
export function panels(db, { limit = null } = {}) {
  const head = db.prepare('SELECT COALESCE(MAX(seq), 0) AS seq FROM events').get().seq;
  const out = { head_seq: head, panels: {} };
  for (const name of PANELS) out.panels[name] = panel(db, name, { limit });
  return out;
}

/**
 * G8 read-side acceptance: the surface exists, every panel resolves, and the
 * numbers it shows agree with the base tables rather than with each other.
 * This does not pass G8 — the desktop shell, Living Body and voice are not
 * built — it only records which half is genuinely earned.
 */
export function g8ReadSideAcceptance(db) {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok, detail });

  for (const name of PANELS) {
    try {
      const p = panel(db, name);
      add(`panel_${name}_resolves`, true, `${p.total} row(s), attention ${p.attention}`);
    } catch (err) {
      add(`panel_${name}_resolves`, false, err.message);
    }
  }

  const s = db.prepare('SELECT * FROM v_mc_settings').get() ?? {};
  const raw = {
    events: db.prepare('SELECT COUNT(*) AS n FROM events').get().n,
    migrations: db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n,
    active: db.prepare("SELECT COUNT(*) AS n FROM projects WHERE status IN ('BUILD','WATCH')").get()
      .n,
    inbox: db.prepare('SELECT COUNT(*) AS n FROM inbox_items').get().n,
    goals: db.prepare('SELECT COUNT(*) AS n FROM goals').get().n,
  };
  add(
    'settings_matches_base_tables',
    s.events === raw.events &&
      s.migrations_applied === raw.migrations &&
      s.projects_active === raw.active,
    `events ${s.events}/${raw.events}, migrations ${s.migrations_applied}/${raw.migrations}, active ${s.projects_active}/${raw.active}`,
  );
  add(
    'inbox_panel_covers_every_item',
    panel(db, 'inbox', { limit: 1_000_000 }).total === raw.inbox,
    `${panel(db, 'inbox', { limit: 1_000_000 }).total}/${raw.inbox}`,
  );
  add(
    'council_panel_covers_every_goal',
    panel(db, 'council', { limit: 1_000_000 }).total === raw.goals,
    `${panel(db, 'council', { limit: 1_000_000 }).total}/${raw.goals}`,
  );

  // A goal may never read as decided unless a verdict says so. This is the one
  // display rule that can turn a refusal into an apparent approval.
  const falseDecided = db
    .prepare(
      `SELECT COUNT(*) AS n FROM v_mc_council
        WHERE decision IS NULL AND state IN ('SELECTED', 'DONE')`,
    )
    .get().n;
  add('no_goal_shown_decided_without_verdict', falseDecided === 0, `${falseDecided} offender(s)`);

  // The stop must be shown as engaged whenever it is engaged.
  const stop = db.prepare('SELECT engaged FROM emergency_stop WHERE id = 1').get()?.engaged ?? 1;
  add(
    'settings_shows_the_real_stop',
    s.emergency_stop_engaged === stop,
    `panel ${s.emergency_stop_engaged}, table ${stop}`,
  );

  return { ok: checks.every((c) => c.ok), checks };
}
