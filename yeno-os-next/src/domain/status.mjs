import { integrityCheck } from '../core/db.mjs';
import { appliedMigrations, assertNoDrift } from '../core/migrate.mjs';
import { verifyChain } from '../core/events.mjs';
import { stopEngaged } from '../core/governor.mjs';

export function statusReport(db, { migrationsDir } = {}) {
  const chain = verifyChain(db);
  const counts = (sql) => db.prepare(sql).get().n;
  let drift = 'ok';
  try {
    assertNoDrift(db, migrationsDir);
  } catch (err) {
    drift = err.message;
  }
  return {
    generated_at: new Date().toISOString(),
    node: process.version,
    release: db.prepare('SELECT * FROM v_release_status').get(),
    integrity: integrityCheck(db),
    migration_drift: drift,
    migrations: appliedMigrations(db).map((m) => ({ filename: m.filename, checksum: m.checksum })),
    event_ledger: { count: chain.count, ok: chain.ok, head_hash: chain.headHash ?? null, reason: chain.reason ?? null },
    emergency_stop: stopEngaged(db) ? 'ON' : 'OFF',
    active_runs: counts("SELECT COUNT(*) AS n FROM runs WHERE state IN ('PENDING','RUNNING','PAUSED')"),
    live_approvals: counts('SELECT COUNT(*) AS n FROM approvals WHERE revoked = 0 AND uses < max_uses'),
    sources: counts('SELECT COUNT(*) AS n FROM sources'),
    source_versions: counts('SELECT COUNT(*) AS n FROM source_versions'),
    blobs: counts('SELECT COUNT(*) AS n FROM blobs'),
    inbox_unresolved: counts("SELECT COUNT(*) AS n FROM inbox_items WHERE state NOT IN ('PROMOTED','DISABLED')"),
    projects: counts('SELECT COUNT(*) AS n FROM projects'),
    admission_denials: counts("SELECT COUNT(*) AS n FROM admission_attempts WHERE decision = 'DENY'"),
    budget: db.prepare('SELECT profile_id, monthly_limit_krw, spent_krw FROM budget_profiles WHERE active = 1').get(),
    gates: db.prepare('SELECT gate_id, state, blocked_reason FROM gates ORDER BY ordinal').all(),
  };
}

/**
 * Machine verification of the invariants that must hold at any time. The
 * intake invariants are shape-based, not fixed counts, so new sources never
 * break them.
 */
export function verifyReport(db, { migrationsDir } = {}) {
  const checks = [];
  const add = (name, ok, detail = '') => checks.push({ name, ok, detail });

  add('sqlite_integrity', integrityCheck(db) === 'ok', integrityCheck(db));

  try {
    assertNoDrift(db, migrationsDir);
    add('migration_no_drift', true);
  } catch (err) {
    add('migration_no_drift', false, err.message);
  }

  const chain = verifyChain(db);
  add('event_hash_chain', chain.ok, chain.ok ? `${chain.count} events` : `${chain.reason} at ${chain.brokenAt ?? '?'}`);

  const vaultMismatch = db
    .prepare('SELECT COUNT(*) AS n FROM source_versions sv LEFT JOIN blobs b ON b.sha256 = sv.blob_sha256 WHERE b.sha256 IS NULL')
    .get().n;
  add('vault_provenance_complete', vaultMismatch === 0, `${vaultMismatch} source_versions without blob`);

  const inboxNoAction = db
    .prepare("SELECT COUNT(*) AS n FROM inbox_items WHERE next_action IS NULL OR next_action = ''")
    .get().n;
  add('every_inbox_item_has_next_action', inboxNoAction === 0, `${inboxNoAction} items without next action`);

  const titleOnlyPromotions = db
    .prepare(
      `SELECT COUNT(*) AS n FROM projects
        WHERE promoted_from_inbox IS NOT NULL
          AND body_evidence_ref IS NULL AND owner_confirmation_ref IS NULL`,
    )
    .get().n;
  add('no_title_only_promotion', titleOnlyPromotions === 0, `${titleOnlyPromotions} unsupported promotions`);

  const crosswalkOrphans = db
    .prepare(
      `SELECT COUNT(*) AS n FROM id_crosswalk
        WHERE source_version_id IS NULL AND inbox_id IS NULL AND project_id IS NULL`,
    )
    .get().n;
  add('crosswalk_never_orphan', crosswalkOrphans === 0, `${crosswalkOrphans} orphan ids`);

  const activeProfiles = db.prepare('SELECT COUNT(*) AS n FROM budget_profiles WHERE active = 1').get().n;
  add('exactly_one_active_budget_profile', activeProfiles === 1, `${activeProfiles} active`);

  const unpromotedActive = db
    .prepare('SELECT COUNT(*) AS n FROM budget_profiles WHERE active = 1 AND owner_promoted = 0')
    .get().n;
  add('no_unpromoted_active_profile', unpromotedActive === 0, `${unpromotedActive} unpromoted`);

  const activeFormulas = db.prepare('SELECT COUNT(*) AS n FROM priority_formulas WHERE active = 1').get().n;
  add('exactly_one_active_priority_formula', activeFormulas === 1, `${activeFormulas} active`);

  const uncostedRuns = db.prepare('SELECT COUNT(*) AS n FROM runs WHERE cost_p90_krw IS NULL').get().n;
  add('every_run_has_cost_p90', uncostedRuns === 0, `${uncostedRuns} runs without cost_p90`);

  const unapprovedExternal = db
    .prepare("SELECT COUNT(*) AS n FROM runs WHERE authority IN ('A3','A4','A5','A6') AND approval_id IS NULL")
    .get().n;
  add('external_runs_have_approval', unapprovedExternal === 0, `${unapprovedExternal} runs without approval`);

  const passedWithoutEvidence = db
    .prepare("SELECT COUNT(*) AS n FROM gates WHERE state = 'PASSED' AND (evidence_ref IS NULL OR evidence_ref = '')")
    .get().n;
  add('passed_gates_have_evidence', passedWithoutEvidence === 0, `${passedWithoutEvidence} gates`);

  const staleProjections = db
    .prepare('SELECT COUNT(*) AS n FROM projections WHERE last_seq > (SELECT COALESCE(MAX(seq), 0) FROM events)')
    .get().n;
  add('projections_not_ahead_of_ledger', staleProjections === 0, `${staleProjections} projections ahead`);

  const failed = checks.filter((c) => !c.ok);
  return { ok: failed.length === 0, checks, failed: failed.map((c) => c.name) };
}
