import { integrityCheck } from '../core/db.mjs';
import { appliedMigrations, assertNoDrift } from '../core/migrate.mjs';
import { verifyChain } from '../core/events.mjs';
import { stopEngaged } from '../core/governor.mjs';
import { durabilityEvidence } from './soak.mjs';

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
    continuity: db.prepare('SELECT * FROM v_handoff').get(),
    durability: durabilityEvidence(db),
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

  // Continuity: the mission ends at G14, so once sessions have run and gates are
  // still open the ledger must carry an unblocked next action to hand off.
  const missionOpen = db.prepare("SELECT COUNT(*) AS n FROM gates WHERE state <> 'PASSED'").get().n > 0;
  const endedSessions = db
    .prepare("SELECT COUNT(*) AS n FROM session_runs WHERE state <> 'IN_PROGRESS'")
    .get().n;
  const pendingNext = db
    .prepare(
      `SELECT COUNT(*) AS n FROM next_run n
        LEFT JOIN blockers b ON b.blocker_id = n.blocked_by
        WHERE n.consumed_at IS NULL AND (b.blocker_id IS NULL OR b.state <> 'WAITING')`,
    )
    .get().n;
  add(
    'open_mission_has_next_run',
    !missionOpen || endedSessions === 0 || pendingNext > 0,
    `${pendingNext} unblocked NEXT_RUN entries after ${endedSessions} ended sessions`,
  );

  const waitingWithoutDetail = db
    .prepare("SELECT COUNT(*) AS n FROM blockers WHERE state = 'WAITING' AND (detail IS NULL OR detail = '')")
    .get().n;
  add('waiting_blockers_are_explained', waitingWithoutDetail === 0, `${waitingWithoutDetail} unexplained blockers`);

  const closedWithoutReport = db
    .prepare(
      "SELECT COUNT(*) AS n FROM session_runs WHERE state <> 'IN_PROGRESS' AND (report IS NULL OR report = '')",
    )
    .get().n;
  add('closed_sessions_have_report', closedWithoutReport === 0, `${closedWithoutReport} sessions without report`);

  // G6 functional self, PREP_ONLY: implementation may proceed, promotion may not.
  const hiddenGoals = db
    .prepare(
      `SELECT COUNT(*) AS n FROM goals g
        WHERE g.state = 'SELECTED'
          AND NOT EXISTS (SELECT 1 FROM council_verdicts v
                           WHERE v.verdict_id = g.verdict_id AND v.decision = 'SELECT' AND v.constitution_ok = 1)`,
    )
    .get().n;
  add('selected_goals_have_passing_verdict', hiddenGoals === 0, `${hiddenGoals} goals selected without a verdict`);

  // G1 Durable Truth: green tests are not durability. The gate may only be
  // PASSED once a soak session survived real SIGKILLs and a real restore.
  const g1 = db.prepare("SELECT state FROM gates WHERE gate_id = 'G1'").get();
  const soak = durabilityEvidence(db);
  add(
    'g1_not_passed_without_soak',
    g1.state !== 'PASSED' || soak !== null,
    soak ? `soak ${soak.soak_id}: ${soak.completed_cycles} cycles, ${soak.kill_count} kills` : 'no passing soak session',
  );

  const soakFakePass = db
    .prepare(
      `SELECT COUNT(*) AS n FROM soak_sessions s
        WHERE s.state = 'PASSED'
          AND (s.kill_count = 0 OR s.restore_count = 0 OR s.completed_cycles < s.planned_cycles
               OR EXISTS (SELECT 1 FROM durability_probes p WHERE p.soak_id = s.soak_id AND p.ok = 0))`,
    )
    .get().n;
  add('no_soak_passed_without_probes', soakFakePass === 0, `${soakFakePass} soak sessions passed without evidence`);

  const g5 = db.prepare("SELECT state, blocked_reason FROM gates WHERE gate_id = 'G5'").get();
  const g6 = db.prepare("SELECT state, blocked_reason FROM gates WHERE gate_id = 'G6'").get();
  add(
    'g5_not_passed_without_live_run',
    g5.state !== 'PASSED' || !/BLOCKED_PROVIDER_ACCESS/.test(g5.blocked_reason ?? ''),
    `G5 ${g5.state}: ${g5.blocked_reason ?? 'no reason recorded'}`,
  );
  add(
    'g6_not_promoted_before_g5',
    !(g6.state === 'PASSED' && g5.state !== 'PASSED'),
    `G6 ${g6.state} while G5 ${g5.state}`,
  );

  const claims = db
    .prepare(
      `SELECT COUNT(*) AS n FROM self_model_answers
        WHERE lower(answer) LIKE '%i am conscious%' OR lower(answer) LIKE '%i am sentient%'
           OR lower(answer) LIKE '%i am alive%'`,
    )
    .get().n;
  add('no_consciousness_claim_recorded', claims === 0, `${claims} claims`);

  const failed = checks.filter((c) => !c.ok);
  return { ok: failed.length === 0, checks, failed: failed.map((c) => c.name) };
}
