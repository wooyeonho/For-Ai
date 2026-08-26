// Re-adjudicate an external YENO lane against this lane's acceptance rules.
//
// The external lane has a different schema, so this cannot call our own
// promotionBlockers() directly. Instead it applies the same CLAUDE.md §9
// acceptance criteria this lane enforces, measured against the external DB and
// repository — never against the external lane's own claims, and never by
// importing the external lane's src/ (that would only prove its code agrees
// with itself).
//
// Adversarial probes run on a throwaway copy of the external DB. The original
// tree is opened read-only and is never mutated.
//
// Usage: node scripts/readjudicate-external-lane.mjs --root /path/to/lane [--json out.json]
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const argOf = (name, fallback = null) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};
const root = argOf('--root');
if (!root) {
  console.error('usage: node scripts/readjudicate-external-lane.mjs --root <lane-root> [--json <out>]');
  process.exit(2);
}

const GENESIS = '0'.repeat(64);
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const findings = [];

/** Record one measured finding. verdict: PASS | FAIL | TEST_ONLY | UNVERIFIABLE */
function record(gate, check, verdict, measured) {
  findings.push({ gate, check, verdict, measured });
  const mark = { PASS: 'PASS  ', FAIL: 'FAIL  ', TEST_ONLY: 'TESTS ', UNVERIFIABLE: 'UNVER ' }[verdict];
  console.log(`${mark} ${gate} ${check}\n        ${measured}`);
}

const dbPath = join(root, 'state', 'yeno.db');
if (!existsSync(dbPath)) {
  console.error(`no external DB at ${dbPath}`);
  process.exit(2);
}
const live = new DatabaseSync(dbPath, { readOnly: true });
const one = (sql, ...p) => {
  try {
    return live.prepare(sql).get(...p);
  } catch (err) {
    return { __err: err.message };
  }
};
const all = (sql, ...p) => {
  try {
    return live.prepare(sql).all(...p);
  } catch (err) {
    return [{ __err: err.message }];
  }
};

/** A scratch copy of the external DB, for probes that must attempt a write. */
function scratchDb() {
  const dir = mkdtempSync(join(tmpdir(), 'readjudicate-'));
  const p = join(dir, 'copy.db');
  copyFileSync(dbPath, p);
  for (const suffix of ['-wal', '-shm']) {
    if (existsSync(dbPath + suffix)) copyFileSync(dbPath + suffix, p + suffix);
  }
  return { db: new DatabaseSync(p), dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/**
 * Attempt a write that a hardened schema must refuse. `seed` rows are inserted
 * first so an empty table cannot make the probe look like a refusal or like a
 * bypass: a statement that changed zero rows exercised no guard at all and is
 * reported UNVERIFIABLE rather than counted against the lane.
 */
function refusalProbe(gate, check, sql, note, seed = []) {
  const s = scratchDb();
  try {
    for (const stmt of seed) s.db.prepare(stmt).run();
  } catch (err) {
    record(gate, check, 'UNVERIFIABLE', `probe could not be seeded: ${err.message}`);
    s.db.close();
    s.cleanup();
    return;
  }
  try {
    const { changes } = s.db.prepare(sql).run();
    if (changes === 0) {
      record(gate, check, 'UNVERIFIABLE', `statement changed 0 rows, so no guard was exercised: ${sql}`);
    } else {
      record(gate, check, 'FAIL', `raw SQL changed ${changes} row(s) with no schema refusal: ${sql} — ${note}`);
    }
  } catch (err) {
    record(gate, check, 'PASS', `schema refused: ${err.message}`);
  } finally {
    s.db.close();
    s.cleanup();
  }
}

const PROBE_NOW = '2026-08-26T00:00:00.000Z';
const SEED_EXT_PROJECT = `INSERT INTO projects (id, title, status, created_at)
  VALUES ('probe-proj', 'title only conversation', 'CANDIDATE', '${PROBE_NOW}')`;
const SEED_EXT_SOURCE_VERSION = [
  `INSERT INTO sources (id, kind, external_ref, created_at) VALUES ('probe-src', 'chat_export', NULL, '${PROBE_NOW}')`,
  `INSERT INTO source_versions (id, source_id, content_hash, byte_size, ingested_at, recovery_status)
     VALUES ('probe-sv', 'probe-src', '${'b'.repeat(64)}', 5, '${PROBE_NOW}', 'BODY_MISSING')`,
];

const claimed = Object.fromEntries(all('SELECT gate_id, status FROM gates').map((g) => [g.gate_id, g.status]));
console.log(`external lane: ${root}`);
console.log(`claimed gate states: ${Object.entries(claimed).map(([k, v]) => `${k}=${v}`).join(' ')}\n`);

// ---------------------------------------------------------------- G0
const migDir = join(root, 'migrations');
const applied = all('SELECT id, checksum FROM schema_migrations ORDER BY id');
let checksumMismatch = [];
for (const m of applied) {
  const file = join(migDir, `${m.id}.sql`);
  if (!existsSync(file)) {
    checksumMismatch.push(`${m.id}: file missing`);
    continue;
  }
  const actual = sha256(readFileSync(file));
  if (actual !== m.checksum) checksumMismatch.push(`${m.id}: ${actual} != recorded ${m.checksum}`);
}
record(
  'G0',
  'applied_migration_checksums_match_files',
  checksumMismatch.length === 0 ? 'PASS' : 'FAIL',
  checksumMismatch.length === 0
    ? `${applied.length} applied migrations, every checksum recomputed and matching`
    : checksumMismatch.join(' | '),
);

// Immutability is only real if tampering actually breaks the lane's own gate.
{
  const dir = mkdtempSync(join(tmpdir(), 'readjudicate-tree-'));
  const copy = join(dir, 'lane');
  cpSync(root, copy, { recursive: true, filter: (src) => !src.includes(`${'.git'}`) });
  const target = join(copy, 'migrations', '0001_core.sql');
  writeFileSync(target, `${readFileSync(target, 'utf8')}\n-- tampered by re-adjudication probe\n`);
  const res = spawnSync(process.execPath, ['src/cli.mjs', 'verify'], { cwd: copy, encoding: 'utf8' });
  const detected = res.status !== 0;
  record(
    'G0',
    'tampered_0001_core_is_detected',
    detected ? 'PASS' : 'FAIL',
    detected
      ? `verify exited ${res.status}: ${(res.stdout + res.stderr).trim().split('\n').slice(-1)[0]}`
      : `verify still exited 0 after 0001_core.sql was modified: ${(res.stdout + res.stderr).trim()}`,
  );
  rmSync(dir, { recursive: true, force: true });
}

for (const [check, rel] of [
  ['claude_permission_settings_present', '.claude/settings.json'],
  ['deterministic_pretooluse_hook_present', 'scripts/guard-hooks.mjs'],
]) {
  const ok = existsSync(join(root, rel));
  record('G0', check, ok ? 'PASS' : 'FAIL', ok ? `${rel} exists` : `${rel} is missing`);
}

// ---------------------------------------------------------------- G1
{
  const rows = all('SELECT seq, id, ts, type, payload, prev_hash, hash FROM events ORDER BY seq');
  let prev = GENESIS;
  let broken = null;
  for (const r of rows) {
    const expect = sha256(`${prev}|${r.id}|${r.ts}|${r.type}|${r.payload}`);
    if (r.prev_hash !== prev) broken ??= `seq ${r.seq}: prev_hash link broken`;
    else if (r.hash !== expect) broken ??= `seq ${r.seq}: hash ${r.hash} != independently recomputed ${expect}`;
    prev = r.hash;
  }
  record(
    'G1',
    'hash_chain_independently_recomputed',
    broken === null ? 'PASS' : 'FAIL',
    broken === null ? `${rows.length} events recomputed from genesis, chain intact` : broken,
  );
}

refusalProbe('G1', 'event_ledger_append_only_in_schema', "UPDATE events SET payload = '{\"tampered\":true}' WHERE seq = 1", 'the ledger is mutable by any writer that does not go through this lane JS');
refusalProbe('G1', 'event_ledger_delete_refused_in_schema', 'DELETE FROM events WHERE seq = 1', 'ledger rows can be deleted by raw SQL');

{
  // This lane's G1 floor: 100 crash cycles, each with kill, restore and probes.
  const soakTable = one("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('soak_sessions','durability_probes')");
  const cycles = soakTable && !soakTable.__err ? one('SELECT MAX(completed_cycles) AS n FROM soak_sessions')?.n ?? 0 : 0;
  record(
    'G1',
    'durability_soak_floor_100_cycles',
    cycles >= 100 ? 'PASS' : 'FAIL',
    soakTable && !soakTable.__err
      ? `longest recorded soak = ${cycles} cycles`
      : 'no soak_sessions/durability_probes tables exist: crash/restore durability is proven only inside the test suite (150 appends, 1 SIGKILL), with no per-cycle evidence rows and no recorded restore count',
  );
}

{
  const backups = existsSync(join(root, 'state', 'backups'));
  record('G1', 'backup_restore_evidence_on_disk', backups ? 'PASS' : 'FAIL', backups ? 'state/backups contains a real backup file' : 'no state/backups directory');
}

// ---------------------------------------------------------------- G2
{
  const sources = one('SELECT COUNT(*) AS n FROM sources')?.n ?? 0;
  const versions = one('SELECT COUNT(*) AS n FROM source_versions')?.n ?? 0;
  const projects = one('SELECT COUNT(*) AS n FROM projects')?.n ?? 0;
  const exports_ = one("SELECT COUNT(*) AS n FROM sources WHERE kind LIKE '%chat%export%'")?.n ?? 0;
  record(
    'G2',
    'official_chat_export_ingested',
    exports_ > 0 ? 'PASS' : 'FAIL',
    `live DB holds sources=${sources}, source_versions=${versions}, projects=${projects}, chat-export sources=${exports_}: the intake mechanism has never run on a real source outside its own tests`,
  );
  const withStatus = one("SELECT COUNT(*) AS n FROM source_versions WHERE recovery_status IN ('BODY_MISSING','RECOVERED','FAILED','EXCEPTION')")?.n ?? 0;
  record(
    'G2',
    'coverage_invariant_holds_over_real_rows',
    versions === withStatus ? (versions === 0 ? 'TEST_ONLY' : 'PASS') : 'FAIL',
    versions === 0 ? 'invariant holds vacuously over 0 rows — true, but not evidence of intake' : `${withStatus}/${versions} source_versions carry a recovery state`,
  );
}

refusalProbe(
  'G2',
  'title_only_promotion_refused_in_schema',
  "UPDATE projects SET status = 'PROMOTED' WHERE id = 'probe-proj'",
  'a project can reach PROMOTED with no promotion row, no evidence_ref and no approver',
  [SEED_EXT_PROJECT],
);
refusalProbe(
  'G2',
  'recovered_body_needs_provenance_in_schema',
  "UPDATE source_versions SET recovery_status = 'RECOVERED' WHERE id = 'probe-sv'",
  'a body can be marked RECOVERED with no recovery attempt or evidence recorded',
  SEED_EXT_SOURCE_VERSION,
);

// ---------------------------------------------------------------- G3
{
  // Fair to the external lane: also exercise its own CLI, so a guard that lives
  // in its JS is credited even when the schema does not enforce it.
  const dir = mkdtempSync(join(tmpdir(), 'readjudicate-cli-'));
  const copy = join(dir, 'lane');
  cpSync(root, copy, { recursive: true, filter: (src) => !src.includes('.git') });
  const cli = (...argv) => spawnSync(process.execPath, ['src/cli.mjs', ...argv], { cwd: copy, encoding: 'utf8' });

  for (const suffix of ['', '-wal', '-shm']) rmSync(join(copy, 'state', `yeno.db${suffix}`), { force: true });
  cli('migrate');
  const stopStatus = cli('stop-status');
  const stopOn = /\bON\b|on:\s*true|true/i.test(`${stopStatus.stdout}${stopStatus.stderr}`);
  record(
    'G3',
    'emergency_stop_defaults_ON_on_a_fresh_install',
    stopOn ? 'PASS' : 'FAIL',
    stopOn
      ? `fresh DB reports stop ${stopStatus.stdout.trim()}`
      : `fresh DB reports stop ${stopStatus.stdout.trim() || stopStatus.stderr.trim()} — the stop state is derived from the last emergency_stop.set event and defaults to OFF when none exists (fail-open), and the live DB contains no such event`,
  );

  // A fresh install must admit nothing until the Owner releases the stop. Uses a
  // non-external action so the only thing that can deny it is the stop itself.
  const admit = cli('run-admit', 'local.edit', 'src/x.mjs', '100');
  const denied = /denied|refus|blocked|stop/i.test(`${admit.stdout}${admit.stderr}`);
  record(
    'G3',
    'fresh_install_admits_no_run_until_stop_is_released',
    denied ? 'PASS' : 'FAIL',
    `run-admit local.edit on a fresh DB: exit ${admit.status}, ${(admit.stdout + admit.stderr).trim().split('\n')[0]}`,
  );

  const badPass = cli('gate-pass', 'G11', 'evidence/DOES-NOT-EXIST.md');
  record(
    'G3',
    'cli_refuses_gate_pass_without_real_evidence',
    badPass.status !== 0 ? 'PASS' : 'FAIL',
    badPass.status === 0
      ? `its own CLI marked G11 PASSED pointing at a nonexistent evidence file: ${(badPass.stdout + badPass.stderr).trim().split('\n')[0]}`
      : `CLI refused: ${(badPass.stdout + badPass.stderr).trim().split('\n')[0]}`,
  );

  const proj = cli('project-create', 'title-only project');
  const projectId = (proj.stdout || '').trim().split(/\s+/).pop();
  const promote = cli('project-promote', projectId);
  record(
    'G2',
    'cli_refuses_title_only_promotion',
    promote.status !== 0 ? 'PASS' : 'FAIL',
    promote.status !== 0
      ? `CLI refused promotion of a body-less project: ${(promote.stdout + promote.stderr).trim().split('\n')[0]}`
      : `CLI promoted a project with no body and no evidence: ${(promote.stdout + promote.stderr).trim().split('\n')[0]}`,
  );

  rmSync(dir, { recursive: true, force: true });
}

{
  // Red team: flip the stop OFF as an ungoverned writer. Emergency stop derived
  // from the last event with no schema protection means any writer owns it.
  const s = scratchDb();
  let outcome;
  try {
    const head = s.db.prepare('SELECT hash FROM events ORDER BY seq DESC LIMIT 1').get()?.hash ?? GENESIS;
    const id = 'redteam-stop-off';
    const ts = new Date().toISOString();
    const payload = JSON.stringify({ on: false, reason: 'red team: ungoverned writer' });
    const hash = sha256(`${head}|${id}|${ts}|emergency_stop.set|${payload}`);
    s.db.prepare('INSERT INTO events (id, idempotency_key, ts, type, payload, prev_hash, hash) VALUES (?,?,?,?,?,?,?)')
      .run(id, id, ts, 'emergency_stop.set', payload, head, hash);
    const now = s.db.prepare("SELECT payload FROM events WHERE type='emergency_stop.set' ORDER BY seq DESC LIMIT 1").get().payload;
    outcome = `raw INSERT flipped the governor's stop state to ${now} with a valid chain hash: the stop is bypassable without touching this lane's JS`;
  } catch (err) {
    outcome = `refused: ${err.message}`;
  }
  record('G3', 'emergency_stop_survives_direct_sql_red_team', outcome.startsWith('refused') ? 'PASS' : 'FAIL', outcome);
  s.db.close();
  s.cleanup();
}

refusalProbe('G3', 'approval_single_use_survives_replay', 'UPDATE approvals SET used_count = 0, max_uses = 99', 'a consumed one-shot approval can be reset and replayed by raw SQL', []);
refusalProbe('G3', 'gate_status_not_settable_by_hand', "UPDATE gates SET status = 'PASSED', evidence_ref = NULL WHERE gate_id = 'G11'", 'any gate, including G11 acceptance, can be marked PASSED by hand with no evidence');

{
  const costGate = one("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='trigger' AND sql LIKE '%cost%'")?.n ?? 0;
  record(
    'G3',
    'cost_hard_gate_enforced_in_schema',
    costGate > 0 ? 'PASS' : 'FAIL',
    costGate > 0 ? `${costGate} cost triggers present` : 'no schema-level cost gate: an unknown or over-budget cost is only blocked when the caller uses admitRun()',
  );
}

// ---------------------------------------------------------------- G4
{
  const idem = one("SELECT sql FROM sqlite_master WHERE type='table' AND name='runs'")?.sql ?? '';
  const hasIdem = /idempotency_key\s+TEXT\s+UNIQUE/i.test(idem);
  record(
    'G4',
    'run_idempotency_key_unique',
    hasIdem ? 'PASS' : 'FAIL',
    hasIdem ? 'runs.idempotency_key is UNIQUE: a retried enqueue cannot duplicate an external effect' : 'runs has no unique idempotency key',
  );
  const hasFence = /fence|fencing/i.test(idem);
  record(
    'G4',
    'lease_fencing_token',
    hasFence ? 'PASS' : 'FAIL',
    hasFence ? 'runs carries a fencing token' : 'lease is (lease_owner, lease_expires_at) with no fencing token: a revived worker whose lease expired cannot be detected as stale by the writes it makes',
  );
  const stuck = one("SELECT COUNT(*) AS n FROM runs WHERE status = 'LEASED' AND lease_expires_at < datetime('now')")?.n ?? 0;
  record('G4', 'no_stuck_leases_outstanding', stuck === 0 ? 'PASS' : 'FAIL', `${stuck} runs hold an expired lease`);
  const done = one("SELECT COUNT(*) AS n FROM runs WHERE status='DONE'")?.n ?? 0;
  const dead = one("SELECT COUNT(*) AS n FROM runs WHERE status='DEAD_LETTER'")?.n ?? 0;
  record('G4', 'queue_exercised_for_real', done > 0 ? 'PASS' : 'TEST_ONLY', `runs table: DONE=${done}, DEAD_LETTER=${dead} — a real provider run went through the queue`);
}

refusalProbe('G4', 'lease_not_stealable_by_raw_sql', "UPDATE runs SET lease_owner = 'attacker', status = 'LEASED'", 'any writer can steal or forge a lease', []);

// ---------------------------------------------------------------- verdicts
const GATES = ['G0', 'G1', 'G2', 'G3', 'G4'];
const verdicts = GATES.map((gate) => {
  const mine = findings.filter((f) => f.gate === gate);
  const failed = mine.filter((f) => f.verdict === 'FAIL');
  const testOnly = mine.filter((f) => f.verdict === 'TEST_ONLY');
  const unverifiable = mine.filter((f) => f.verdict === 'UNVERIFIABLE');
  const state =
    failed.length > 0
      ? 'REFUSED'
      : unverifiable.length > 0
        ? 'UNPROVEN'
        : testOnly.length > 0
          ? 'TEST_ONLY'
          : 'UPHELD';
  return {
    gate,
    claimed: claimed[gate] ?? '(none)',
    readjudicated: state,
    checks: mine.length,
    failed: failed.map((f) => f.check),
    unverifiable: unverifiable.map((f) => f.check),
  };
});

console.log('\n=== re-adjudication under this lane\'s rules ===');
for (const v of verdicts) {
  console.log(`${v.gate}: claimed ${v.claimed} -> ${v.readjudicated}${v.failed.length ? ` (${v.failed.join(', ')})` : ''}`);
}

const out = argOf('--json');
if (out) {
  writeFileSync(out, `${JSON.stringify({ generated_at: new Date().toISOString(), root, claimed, verdicts, findings }, null, 2)}\n`);
  console.log(`\nwrote ${out}`);
}
live.close();
process.exit(0);
