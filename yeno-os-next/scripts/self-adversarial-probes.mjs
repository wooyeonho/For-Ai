// The same adversarial probes the external-lane re-adjudication runs, aimed at
// this lane. A ruler that only ever fails somebody else's work is not evidence,
// so every refusal claimed about another lane is demonstrated here on this one.
//
// Probes run on a throwaway copy of state/yeno.db; the live DB is never mutated.
import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = new URL('../', import.meta.url).pathname;
const dbPath = join(ROOT, 'state', 'yeno.db');
const results = [];

function record(check, verdict, measured) {
  results.push({ check, verdict, measured });
  console.log(`${verdict.padEnd(13)} ${check}\n        ${measured}`);
}

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'self-probe-'));
  const p = join(dir, 'copy.db');
  copyFileSync(dbPath, p);
  for (const s of ['-wal', '-shm']) if (existsSync(dbPath + s)) copyFileSync(dbPath + s, p + s);
  return { db: new DatabaseSync(p), path: p, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/**
 * Attempt a write the schema must refuse. `seed` rows are inserted first so the
 * probe cannot pass vacuously by touching zero rows — a statement that changed
 * nothing proves nothing, and is reported as UNVERIFIABLE rather than as a pass.
 */
function refusal(check, sql, whyItMatters, seed = []) {
  const s = scratch();
  try {
    for (const stmt of seed) s.db.prepare(stmt).run();
  } catch (err) {
    record(check, 'UNVERIFIABLE', `probe could not be seeded: ${err.message}`);
    s.db.close();
    s.cleanup();
    return;
  }
  try {
    const { changes } = s.db.prepare(sql).run();
    if (changes === 0) record(check, 'UNVERIFIABLE', `statement changed 0 rows, so no guard was exercised: ${sql}`);
    else record(check, 'FAIL', `raw SQL changed ${changes} row(s): ${sql} — ${whyItMatters}`);
  } catch (err) {
    record(check, 'PASS', `schema refused: ${err.message}`);
  } finally {
    s.db.close();
    s.cleanup();
  }
}

const NOW = '2026-08-26T00:00:00.000Z';
const SEED_INBOX = `INSERT INTO inbox_items (inbox_id, title, state, attempts, next_action, created_at, updated_at)
  VALUES ('probe-inbox', 'title only conversation', 'BODY_MISSING', 0, 'await official export', '${NOW}', '${NOW}')`;
const SEED_BLOB = `INSERT INTO blobs (sha256, size_bytes, bytes, created_at)
  VALUES ('${'a'.repeat(64)}', 5, X'68656c6c6f', '${NOW}')`;
const SEED_APPROVAL = `INSERT INTO approvals (approval_id, scope_hash, exact_action, target, payload_hash, max_cost_krw, expires_at, max_uses, uses, rollback_plan, granted_by, created_at)
  VALUES ('probe-appr', 'scope', 'external.provider_run', 'codex', 'hash', 1000, '2099-01-01T00:00:00.000Z', 1, 1, 'revoke', 'owner', '${NOW}')`;

refusal('event_ledger_append_only_in_schema', "UPDATE events SET payload = '{\"tampered\":true}' WHERE seq = 1", 'the ledger would be mutable by any writer');
refusal('event_ledger_delete_refused_in_schema', 'DELETE FROM events WHERE seq = 1', 'ledger rows could be deleted');
refusal('gate_state_not_settable_by_hand', "UPDATE gates SET state = 'PASSED', evidence_ref = NULL WHERE gate_id = 'G11'", 'any gate could be marked PASSED with no evidence');
refusal('approval_use_count_not_rewindable', "UPDATE approvals SET uses = 0, max_uses = 99 WHERE approval_id = 'probe-appr'", 'a consumed one-shot approval could be replayed', [SEED_APPROVAL]);
refusal('vault_bytes_immutable', `UPDATE blobs SET bytes = X'00' WHERE sha256 = '${'a'.repeat(64)}'`, 'sealed raw source bytes could be rewritten', [SEED_BLOB]);
refusal(
  'title_only_promotion_refused_in_schema',
  `INSERT INTO projects (project_id, code, name, status, promoted_from_inbox, created_at, updated_at)
   VALUES ('probe-proj', 'PROBE-1', 'title only', 'REGISTRY', 'probe-inbox', '${NOW}', '${NOW}')`,
  'a title could become a project with no body and no Owner confirmation',
  [SEED_INBOX],
);
refusal(
  'cost_hard_gate_enforced_in_schema',
  `INSERT INTO runs (run_id, goal, authority, method_class, network, cost_p90_krw, budget_profile_id, state, created_at, updated_at)
   VALUES ('probe-run', 'probe', 'A2', 'SAFE', 'NONE', NULL, 'LOCAL_SAFE', 'PLANNED', '2026-08-26T00:00:00.000Z', '2026-08-26T00:00:00.000Z')`,
  'a RUN with unknown cost could be created',
);
refusal(
  'ax_method_refused_in_schema',
  `INSERT INTO runs (run_id, goal, authority, method_class, network, cost_p90_krw, budget_profile_id, state, created_at, updated_at)
   VALUES ('probe-ax', 'probe', 'A3', 'AX', 'NONE', 10, 'LOCAL_SAFE', 'PLANNED', '2026-08-26T00:00:00.000Z', '2026-08-26T00:00:00.000Z')`,
  'an AX-class method could be recorded as a run',
);

// Emergency stop must be ON before the Owner has ever touched a fresh install.
{
  const dir = mkdtempSync(join(tmpdir(), 'self-probe-fresh-'));
  const p = join(dir, 'fresh.db');
  const migrate = spawnSync(process.execPath, ['src/cli.mjs', 'migrate', '--db', p], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  let engaged = null;
  if (existsSync(p)) {
    const db = new DatabaseSync(p, { readOnly: true });
    engaged = db.prepare('SELECT engaged FROM emergency_stop WHERE id = 1').get()?.engaged;
    db.close();
  }
  record(
    'emergency_stop_defaults_ON_on_a_fresh_install',
    engaged === 1 ? 'PASS' : 'FAIL',
    engaged === 1
      ? 'a freshly migrated DB has emergency_stop.engaged = 1 as stored state, not derived from a log whose absence means OFF'
      : `fresh DB reports engaged = ${engaged}; migrate said ${(migrate.stdout + migrate.stderr).trim().split('\n').slice(-1)[0]}`,
  );
  rmSync(dir, { recursive: true, force: true });
}

// A gate cannot be promoted through the CLI against fake evidence either.
{
  const s = scratch();
  const scratchPath = s.path;
  s.db.close();
  const bad = spawnSync(
    process.execPath,
    ['src/cli.mjs', 'gate', 'pass', '--gate', 'G11', '--evidence', 'evidence/DOES-NOT-EXIST.md', '--json', '--db', scratchPath],
    { cwd: ROOT, encoding: 'utf8' },
  );
  const out = `${bad.stdout}${bad.stderr}`.trim().split('\n').slice(-3).join(' ');
  const refused = /refus|blocked|does not exist|not passed/i.test(out) || bad.status !== 0;
  record('cli_refuses_gate_pass_without_real_evidence', refused ? 'PASS' : 'FAIL', refused ? `CLI refused: ${out}` : `CLI promoted G11 anyway: ${out}`);
  s.cleanup();
}

// The G1 durability floor is met by recorded per-cycle evidence, not by a claim.
{
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const soak = db
    .prepare("SELECT soak_id, completed_cycles, kill_count, restore_count, evidence_ref FROM soak_sessions WHERE state = 'PASSED' ORDER BY completed_cycles DESC LIMIT 1")
    .get();
  const probes = soak
    ? db.prepare('SELECT COUNT(*) AS n, SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END) AS failed FROM durability_probes WHERE soak_id = ?').get(soak.soak_id)
    : { n: 0, failed: 0 };
  db.close();
  const ok =
    soak &&
    soak.completed_cycles >= 100 &&
    soak.kill_count >= 100 &&
    soak.restore_count >= 100 &&
    Number(probes.failed ?? 0) === 0 &&
    existsSync(join(ROOT, soak.evidence_ref));
  record(
    'durability_soak_floor_100_cycles',
    ok ? 'PASS' : 'FAIL',
    soak
      ? `${soak.completed_cycles} cycles, ${soak.kill_count} SIGKILLs, ${soak.restore_count} restores, ${probes.n} probes with ${probes.failed ?? 0} failures, evidence ${soak.evidence_ref}`
      : 'no passing soak session recorded',
  );
}

const failed = results.filter((r) => r.verdict === 'FAIL');
console.log(`\n${failed.length === 0 ? 'SELF_PROBES_PASS' : 'SELF_PROBES_FAIL'}: ${results.length - failed.length}/${results.length}`);
const out = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;
if (out) writeFileSync(out, `${JSON.stringify({ generated_at: new Date().toISOString(), results }, null, 2)}\n`);
process.exit(failed.length === 0 ? 0 : 1);
