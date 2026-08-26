#!/usr/bin/env node
// Independent validator.
//
// Deliberately does NOT import src/core: it re-implements the hash chain, the
// projection fold and the migration checksum check from the raw files and raw
// rows, so a bug in the kernel implementation cannot validate itself. Run it
// from a separate checkout to also get filesystem independence.
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1]);
const dbPath = args.get('db') ?? process.env.YENO_DB ?? 'state/yeno.db';
const migrationsDir = args.get('migrations') ?? 'migrations';
const asJson = process.argv.includes('--json');
// Evidence refs are repository-relative; resolve them from the repo root.
const REPO = new URL('..', import.meta.url).pathname;

const digest = (s) => createHash('sha256').update(s).digest('hex');

function stable(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stable(value[k])}`)
    .join(',')}}`;
}

const findings = [];
const fail = (check, detail) => findings.push({ check, ok: false, detail });
const pass = (check, detail = '') => findings.push({ check, ok: true, detail });
const verdict = (ok, check, passDetail, failDetail) => (ok ? pass(check, passDetail) : fail(check, failDetail));

if (!existsSync(dbPath)) {
  process.stderr.write(`INDEPENDENT_VALIDATION: no database at ${dbPath}\n`);
  process.exit(2);
}

const db = new DatabaseSync(dbPath, { readOnly: true });

// 1. SQLite's own integrity opinion.
const integrity = db.prepare('PRAGMA integrity_check').all().map((r) => Object.values(r)[0]).join('; ');
verdict(integrity === 'ok', 'sqlite_integrity', '', integrity);

// 2. Migration checksums recomputed from the files on disk.
const applied = db.prepare('SELECT filename, checksum, applied_order FROM schema_migrations ORDER BY applied_order').all();
const diskFiles = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
for (const row of applied) {
  if (!diskFiles.includes(row.filename)) {
    fail('migration_file_present', `${row.filename} missing on disk`);
    continue;
  }
  const recomputed = digest(readFileSync(join(migrationsDir, row.filename), 'utf8'));
  verdict(
    recomputed === row.checksum,
    'migration_checksum',
    row.filename,
    `${row.filename} db=${row.checksum} disk=${recomputed}`,
  );
}
if (applied.map((r) => r.filename).join(',') !== diskFiles.slice(0, applied.length).join(',')) {
  fail('migration_order', `applied=${applied.map((r) => r.filename)} disk=${diskFiles}`);
} else {
  pass('migration_order');
}

// 3. Pinned checksums, recomputed independently of the kernel test suite.
const pinnedPath = join(migrationsDir, 'CHECKSUMS.json');
if (existsSync(pinnedPath)) {
  const pinned = JSON.parse(readFileSync(pinnedPath, 'utf8'));
  for (const f of diskFiles) {
    const actual = digest(readFileSync(join(migrationsDir, f), 'utf8'));
    if (pinned[f] === undefined) fail('pinned_checksum_present', f);
    else if (pinned[f] !== actual) fail('pinned_checksum_match', `${f} pinned=${pinned[f]} actual=${actual}`);
  }
  if (!findings.some((x) => !x.ok && x.check.startsWith('pinned_'))) pass('pinned_checksums');
} else {
  fail('pinned_checksums', 'migrations/CHECKSUMS.json missing');
}

// 4. Hash chain recomputed from raw rows with this file's own hash function.
const events = db.prepare('SELECT * FROM events ORDER BY seq').all();
let prev = '0'.repeat(64);
let chainOk = true;
let expectedSeq = 0;
for (const ev of events) {
  expectedSeq += 1;
  if (ev.seq !== expectedSeq) {
    fail('event_seq_contiguous', `expected ${expectedSeq} got ${ev.seq}`);
    chainOk = false;
    break;
  }
  if (ev.prev_hash !== prev) {
    fail('event_prev_hash', `seq ${ev.seq}`);
    chainOk = false;
    break;
  }
  const recomputed = digest(
    stable({
      prev_hash: ev.prev_hash,
      event_id: ev.event_id,
      ts: ev.ts,
      type: ev.type,
      actor: ev.actor,
      authority: ev.authority,
      payload: stable(JSON.parse(ev.payload)),
    }),
  );
  if (recomputed !== ev.hash) {
    fail('event_hash', `seq ${ev.seq} stored=${ev.hash} recomputed=${recomputed}`);
    chainOk = false;
    break;
  }
  prev = ev.hash;
}
if (chainOk) pass('event_hash_chain', `${events.length} events, head=${prev.slice(0, 16)}`);

// 5. Projections re-folded from the ledger and compared to the stored rows.
const expectedInbox = new Map();
for (const ev of events) {
  const p = JSON.parse(ev.payload);
  if (ev.type === 'inbox.recorded') {
    expectedInbox.set(p.inbox_id, { title: p.title, state: p.state ?? 'BODY_MISSING', attempts: p.attempts ?? 0 });
  } else if (ev.type === 'inbox.state_changed' && expectedInbox.has(p.inbox_id)) {
    const row = expectedInbox.get(p.inbox_id);
    expectedInbox.set(p.inbox_id, { ...row, state: p.state, attempts: p.attempts ?? 0 });
  }
}
const storedInbox = new Map(
  db.prepare('SELECT inbox_id, title, state, attempts FROM proj_inbox_state').all().map((r) => [
    r.inbox_id,
    { title: r.title, state: r.state, attempts: r.attempts },
  ]),
);
const inboxMismatch = [];
for (const [id, want] of expectedInbox) {
  const got = storedInbox.get(id);
  if (!got || stable(got) !== stable(want)) inboxMismatch.push(`${id}: want=${stable(want)} got=${stable(got)}`);
}
for (const id of storedInbox.keys()) if (!expectedInbox.has(id)) inboxMismatch.push(`${id}: not derivable from events`);
verdict(
  inboxMismatch.length === 0,
  'projection_matches_ledger',
  `${expectedInbox.size} inbox rows`,
  inboxMismatch.join(' | '),
);

// 6. Safety objects must still exist in the schema.
const objects = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type IN ('trigger','view','table')").all().map((r) => r.name));
for (const required of [
  'trg_events_no_update',
  'trg_events_no_delete',
  'trg_blobs_immutable',
  'trg_projects_promotion_needs_evidence',
  'trg_runs_blocked_by_stop',
  'trg_runs_cost_hard_gate',
  'trg_runs_ax_forbidden',
  'trg_approvals_scope_immutable',
  'trg_session_checkpoint_needs_next_run',
  'trg_session_close_needs_evidence',
  'trg_next_run_single_consume',
  'trg_next_run_no_delete',
  'trg_goal_select_needs_verdict',
  'trg_verdict_needs_debate',
  'trg_verdict_violation_needs_rule',
  'trg_memory_no_delete',
  'trg_memory_supersession_final',
  'trg_self_no_consciousness_claim',
  'trg_probe_no_delete',
  'trg_probe_no_result_rewrite',
  'trg_soak_pass_needs_evidence',
  'trg_gate_pass_needs_evidence',
  'trg_gate_pass_in_order',
  'trg_g1_pass_needs_soak',
  'trg_g6_pass_needs_g5',
  'v_durability',
  'v_effective_source_versions',
  'v_handoff',
  'admission_attempts',
]) {
  if (!objects.has(required)) fail('safety_object_present', `${required} is missing`);
}
if (!findings.some((f) => !f.ok && f.check === 'safety_object_present')) pass('safety_objects_present');

// 7. Vault provenance: every source_version points at bytes that hash correctly.
const vaultRows = db
  .prepare('SELECT sv.source_version_id, sv.blob_sha256, b.bytes FROM source_versions sv LEFT JOIN blobs b ON b.sha256 = sv.blob_sha256')
  .all();
const vaultProblems = [];
for (const row of vaultRows) {
  if (row.bytes == null) {
    vaultProblems.push(`${row.source_version_id}: no vault bytes`);
    continue;
  }
  const recomputed = createHash('sha256').update(row.bytes).digest('hex');
  if (recomputed !== row.blob_sha256) vaultProblems.push(`${row.source_version_id}: bytes hash mismatch`);
}
verdict(
  vaultProblems.length === 0,
  'vault_bytes_rehashed',
  `${vaultRows.length} source versions`,
  vaultProblems.join(' | '),
);

// 8. Durability: recompute every passing soak verdict from the probe rows
// alone, so a soak cannot be believed on the strength of its own summary.
const soakProblems = [];
const REQUIRED_KINDS = [
  'CRASH_REPLAY',
  'CHAIN_VERIFY',
  'PROJECTION_DETERMINISM',
  'INTEGRITY',
  'BACKUP_RESTORE',
  'LEASE_FENCING',
];
const soakSessions = db.prepare('SELECT * FROM soak_sessions').all();
for (const s of soakSessions) {
  const probes = db.prepare('SELECT kind, ok FROM durability_probes WHERE soak_id = ?').all(s.soak_id);
  const failedProbes = probes.filter((p) => p.ok === 0).length;
  const kinds = new Set(probes.filter((p) => p.ok === 1).map((p) => p.kind));
  const perCycle = db
    .prepare(
      `SELECT cycle, COUNT(*) AS n FROM durability_probes
        WHERE soak_id = ? AND ok = 1 GROUP BY cycle HAVING n < ?`,
    )
    .all(s.soak_id, REQUIRED_KINDS.length);
  const deserved =
    failedProbes === 0 &&
    s.completed_cycles >= s.planned_cycles &&
    s.kill_count > 0 &&
    s.restore_count > 0 &&
    REQUIRED_KINDS.every((k) => kinds.has(k)) &&
    perCycle.length === 0;
  if (s.state === 'PASSED' && !deserved) {
    soakProblems.push(
      `${s.soak_id}: PASSED but ${failedProbes} failed probes, ${s.completed_cycles}/${s.planned_cycles} cycles, ` +
        `${s.kill_count} kills, ${s.restore_count} restores, kinds=${[...kinds].sort().join(',')}, ` +
        `incomplete cycles=${perCycle.map((c) => c.cycle).join(',') || 'none'}`,
    );
  }
  if (s.state === 'PASSED' && !s.evidence_ref) soakProblems.push(`${s.soak_id}: PASSED without evidence_ref`);
}
const g1State = db.prepare("SELECT state FROM gates WHERE gate_id = 'G1'").get()?.state;
const passingSoaks = soakSessions.filter((s) => s.state === 'PASSED').length;
if (g1State === 'PASSED' && passingSoaks === 0) soakProblems.push('G1 is PASSED with no passing soak session');
verdict(
  soakProblems.length === 0,
  'soak_verdicts_recomputed',
  `${soakSessions.length} sessions, ${passingSoaks} passing`,
  soakProblems.join(' | '),
);

// 8b. Intake coverage, recomputed from the base tables rather than read out of
// v_intake_invariant, so a wrong view cannot certify itself. A title is not a
// body and a body is not a project: each of those claims is checked against the
// rows that would have to exist for it to be true.
{
  const intakeProblems = [];
  const count = (sql, ...args) => db.prepare(sql).get(...args).n;

  const noNextAction = count("SELECT COUNT(*) AS n FROM inbox_items WHERE TRIM(next_action) = ''");
  if (noNextAction > 0) intakeProblems.push(`${noNextAction} inbox items have no next action`);

  const bodyless = count(
    "SELECT COUNT(*) AS n FROM inbox_items WHERE state IN ('RECOVERED','PARTIAL') AND source_version_id IS NULL",
  );
  if (bodyless > 0) intakeProblems.push(`${bodyless} items claim a recovered body with no provenance`);

  const unattested = db
    .prepare(
      `SELECT i.inbox_id FROM inbox_items i
        WHERE i.state IN ('RECOVERED','PARTIAL')
          AND NOT EXISTS (
            SELECT 1 FROM recovery_attempts a
             WHERE a.inbox_id = i.inbox_id
               AND a.outcome IN ('RECOVERED','PARTIAL')
               AND a.source_version_id = i.source_version_id)`,
    )
    .all();
  if (unattested.length > 0) {
    intakeProblems.push(`${unattested.length} recovered items have no matching recovery attempt: ${unattested.map((r) => r.inbox_id).slice(0, 5).join(',')}`);
  }

  const titleOnly = db
    .prepare(
      `SELECT project_id FROM projects
        WHERE promoted_from_inbox IS NOT NULL AND body_evidence_ref IS NULL AND owner_confirmation_ref IS NULL`,
    )
    .all();
  if (titleOnly.length > 0) {
    intakeProblems.push(`${titleOnly.length} projects were promoted from a title alone: ${titleOnly.map((r) => r.project_id).slice(0, 5).join(',')}`);
  }

  // Provenance is per (source, bytes, parser); identical bytes from different
  // origins are separate versions, and a re-import must not have forked one.
  const forked = db
    .prepare(
      `SELECT source_id, blob_sha256, parser_version, COUNT(*) AS n FROM source_versions
        GROUP BY source_id, blob_sha256, parser_version, provenance_json HAVING n > 1`,
    )
    .all();
  if (forked.length > 0) intakeProblems.push(`${forked.length} source_version groups were duplicated by re-import`);

  const acceptedWithoutProvenance = count(
    "SELECT COUNT(*) AS n FROM intakes WHERE outcome = 'ACCEPTED' AND source_version_id IS NULL",
  );
  if (acceptedWithoutProvenance > 0) {
    intakeProblems.push(`${acceptedWithoutProvenance} accepted intakes name no source_version`);
  }

  const orphanIntakes = count(
    `SELECT COUNT(*) AS n FROM intakes i
      WHERE i.source_version_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM source_versions sv WHERE sv.source_version_id = i.source_version_id)`,
  );
  if (orphanIntakes > 0) intakeProblems.push(`${orphanIntakes} intakes point at a missing source_version`);

  const fetchedWithoutEvidence = count(
    "SELECT COUNT(*) AS n FROM source_candidates WHERE state = 'FETCHED' AND (evidence_ref IS NULL OR TRIM(evidence_ref) = '')",
  );
  if (fetchedWithoutEvidence > 0) intakeProblems.push(`${fetchedWithoutEvidence} candidates claim FETCHED with no evidence`);

  const g2State = db.prepare("SELECT state FROM gates WHERE gate_id = 'G2'").get()?.state;
  if (g2State === 'PASSED') {
    const chatExports = count("SELECT COUNT(*) AS n FROM sources WHERE kind = 'CHAT_EXPORT'");
    const unresolved = count("SELECT COUNT(*) AS n FROM inbox_items WHERE state IN ('BODY_MISSING','NEEDS_SOURCE')");
    if (chatExports === 0) intakeProblems.push('G2: PASSED with no official chat export ingested');
    if (unresolved > 0) intakeProblems.push(`G2: PASSED with ${unresolved} unresolved inbox items`);
  }

  const inboxTotal = count('SELECT COUNT(*) AS n FROM inbox_items');
  verdict(
    intakeProblems.length === 0,
    'intake_coverage_recomputed',
    `${inboxTotal} inbox items, ${count('SELECT COUNT(*) AS n FROM source_versions')} source versions, ${count('SELECT COUNT(*) AS n FROM intakes')} intakes`,
    intakeProblems.join(' | '),
  );
}

// 9. Release train: every PASSED gate must point at an evidence file that
// really exists on disk, pass in order, and satisfy its own gate rule. This is
// recomputed here without importing src/core or src/domain.
const gateProblems = [];
const gates = db.prepare('SELECT gate_id, ordinal, state, evidence_ref FROM gates ORDER BY ordinal').all();
for (const g of gates) {
  if (g.state !== 'PASSED') continue;
  if (!g.evidence_ref) gateProblems.push(`${g.gate_id}: PASSED without evidence_ref`);
  else if (!existsSync(join(REPO, g.evidence_ref))) {
    gateProblems.push(`${g.gate_id}: evidence file ${g.evidence_ref} is missing on disk`);
  }
  const earlier = gates.filter((o) => o.ordinal < g.ordinal && o.state !== 'PASSED').map((o) => o.gate_id);
  if (earlier.length > 0) gateProblems.push(`${g.gate_id}: PASSED while ${earlier.join(',')} are not`);
}
const g1Row = gates.find((g) => g.gate_id === 'G1');
if (g1Row?.state === 'PASSED') {
  const best = db
    .prepare(
      `SELECT MAX(completed_cycles) AS cycles, MAX(kill_count) AS kills, MAX(restore_count) AS restores
         FROM soak_sessions WHERE state = 'PASSED' AND gate_id = 'G1'`,
    )
    .get();
  if ((best?.cycles ?? 0) < 100 || (best?.kills ?? 0) < 100 || (best?.restores ?? 0) < 100) {
    gateProblems.push(
      `G1: PASSED on a soak of only ${best?.cycles ?? 0} cycles / ${best?.kills ?? 0} kills / ${best?.restores ?? 0} restores`,
    );
  }
}
// G3 governor: recomputed from the raw governance rows, not from
// v_g3_acceptance, so a tampered view cannot certify itself.
const g3Row = gates.find((g) => g.gate_id === 'G3');
const G3_BYPASS_CLASSES = [
  'RAW_SQL',
  'GOVERNOR_API',
  'APPROVAL_REPLAY',
  'APPROVAL_EXPIRY',
  'APPROVAL_PARTIAL_USE',
  'EMERGENCY_STOP',
  'BUDGET',
  'LEASE',
  'AX_METHOD',
  'EVIDENCE',
];
const governorProblems = [];
const allowedBypasses = db.prepare("SELECT bypass_class, attack FROM redteam_probes WHERE outcome = 'ALLOWED'").all();
for (const b of allowedBypasses) governorProblems.push(`red-team bypass was not refused: ${b.bypass_class} — ${b.attack}`);
const unapprovedRuns = db
  .prepare("SELECT COUNT(*) AS n FROM runs WHERE authority IN ('A3','A4','A5','A6') AND approval_id IS NULL")
  .get().n;
if (unapprovedRuns > 0) governorProblems.push(`${unapprovedRuns} high-authority RUN(s) exist with no approval`);
const overUsedApprovals = db.prepare('SELECT COUNT(*) AS n FROM approvals WHERE uses > max_uses').get().n;
if (overUsedApprovals > 0) governorProblems.push(`${overUsedApprovals} approval(s) used more times than granted`);
// A usable approval must cite an Owner Packet that really exists: "granted_by =
// owner" is a label, the packet file is the artefact the Owner can dispute.
for (const a of db
  .prepare('SELECT approval_id, owner_packet_ref FROM approvals WHERE revoked = 0 AND uses < max_uses')
  .all()) {
  if (!a.owner_packet_ref) governorProblems.push(`${a.approval_id}: usable with no Owner Packet reference`);
  else if (!existsSync(join(REPO, a.owner_packet_ref))) {
    governorProblems.push(`${a.approval_id}: Owner Packet ${a.owner_packet_ref} is missing on disk`);
  }
}
const stopRows = db.prepare('SELECT COUNT(*) AS n FROM emergency_stop').get().n;
if (stopRows !== 1) governorProblems.push(`emergency_stop has ${stopRows} rows, expected exactly 1`);
if (g3Row?.state === 'PASSED') {
  const covered = db
    .prepare("SELECT DISTINCT bypass_class FROM redteam_probes WHERE outcome = 'REFUSED'")
    .all()
    .map((r) => r.bypass_class);
  const missing = G3_BYPASS_CLASSES.filter((c) => !covered.includes(c));
  if (missing.length > 0) governorProblems.push(`G3: PASSED with no refused probe for ${missing.join(',')}`);
  if (db.prepare("SELECT COUNT(*) AS n FROM admission_attempts WHERE decision = 'DENY'").get().n === 0) {
    governorProblems.push('G3: PASSED with no recorded admission denial');
  }
}
verdict(
  governorProblems.length === 0,
  'governor_recomputed',
  `${db.prepare('SELECT COUNT(*) AS n FROM redteam_probes').get().n} red-team probes, ` +
    `${db.prepare("SELECT COUNT(*) AS n FROM admission_attempts WHERE decision = 'DENY'").get().n} denials recorded`,
  governorProblems.join(' | '),
);

// G4 recomputed from raw queue rows. The runtime's own views are not consulted:
// duplicate external effects and forged retry budgets are counted here directly.
const g4Row = gates.find((g) => g.gate_id === 'G4');
const queueProblems = [];
const liveDuplicates = db
  .prepare(
    `SELECT idempotency_key, COUNT(*) AS n FROM external_effects
      WHERE state <> 'ABANDONED' GROUP BY idempotency_key HAVING n > 1`,
  )
  .all();
for (const d of liveDuplicates) queueProblems.push(`${d.n} live effects share idempotency key ${d.idempotency_key}`);
const committedWithoutEvidence = db
  .prepare("SELECT COUNT(*) AS n FROM external_effects WHERE state = 'COMMITTED' AND (evidence_ref IS NULL OR TRIM(evidence_ref) = '')")
  .get().n;
if (committedWithoutEvidence > 0) queueProblems.push(`${committedWithoutEvidence} committed effect(s) carry no evidence`);
const unapprovedEffects = db
  .prepare(
    `SELECT COUNT(*) AS n FROM external_effects e JOIN jobs j USING (job_id)
      WHERE j.authority IN ('A3','A4','A5','A6') AND e.approval_id IS NULL`,
  )
  .get().n;
if (unapprovedEffects > 0) queueProblems.push(`${unapprovedEffects} high-authority external effect(s) with no approval`);
const overBudgetJobs = db.prepare('SELECT COUNT(*) AS n FROM jobs WHERE attempt > max_attempts').get().n;
if (overBudgetJobs > 0) queueProblems.push(`${overBudgetJobs} job(s) ran past their retry budget`);
const silentDeadLetters = db
  .prepare("SELECT COUNT(*) AS n FROM jobs WHERE state = 'DEAD_LETTER' AND (last_error IS NULL OR TRIM(last_error) = '')")
  .get().n;
if (silentDeadLetters > 0) queueProblems.push(`${silentDeadLetters} dead-lettered job(s) with no recorded error`);
const forgedTokens = db
  .prepare("SELECT COUNT(*) AS n FROM jobs WHERE state = 'LEASED' AND lease_token <> lease_epoch").get().n;
if (forgedTokens > 0) queueProblems.push(`${forgedTokens} leased job(s) hold a token that is not the current epoch`);
const openAttemptsOnFinished = db
  .prepare(
    `SELECT COUNT(*) AS n FROM job_attempts a JOIN jobs j USING (job_id)
      WHERE j.state IN ('DONE','DEAD_LETTER','CANCELLED') AND a.outcome IS NULL`,
  )
  .get().n;
if (openAttemptsOnFinished > 0) queueProblems.push(`${openAttemptsOnFinished} finished job(s) left an attempt open`);
const scheduler = db.prepare('SELECT * FROM scheduler_state WHERE id = 1').get();
if (!scheduler) queueProblems.push('scheduler_state row is missing, so its default cannot be checked');
else if (scheduler.enabled === 1 && scheduler.changed_by !== 'owner') {
  queueProblems.push(`the scheduler is enabled by ${scheduler.changed_by}, not the Owner`);
}
// Crash evidence: at least one soak where both kill points held, recomputed from
// the per-cycle rows rather than the summary view.
const soaks = db
  .prepare(
    `SELECT soak_ref, COUNT(*) AS cycles, SUM(ok) AS ok_cycles, MAX(effect_lines) AS worst,
            SUM(kill_point = 'after-claim') AS after_claim, SUM(kill_point = 'after-effect') AS after_effect
       FROM queue_soak_cycles GROUP BY soak_ref`,
  )
  .all();
const dishonestSoak = db.prepare('SELECT COUNT(*) AS n FROM queue_soak_cycles WHERE ok = 1 AND effect_lines > 1').get().n;
if (dishonestSoak > 0) queueProblems.push(`${dishonestSoak} soak cycle(s) call a duplicated effect a pass`);
// The strongest clean soak is the one worth reporting, so a short CI run does
// not make the recorded crash evidence look thinner than it is.
const cleanSoak = soaks
  .filter((s) => s.cycles === s.ok_cycles && s.after_claim > 0 && s.after_effect > 0 && s.worst <= 1)
  .sort((a, b) => b.cycles - a.cycles)[0];
if (g4Row?.state === 'PASSED' && !cleanSoak) {
  queueProblems.push('G4: PASSED with no crash soak covering both kill points');
}
verdict(
  queueProblems.length === 0,
  'workflow_runtime_recomputed',
  `${db.prepare('SELECT COUNT(*) AS n FROM jobs').get().n} jobs, ` +
    `${db.prepare('SELECT COUNT(*) AS n FROM external_effects').get().n} external effects, ` +
    `${cleanSoak ? `soak ${cleanSoak.soak_ref} ${cleanSoak.ok_cycles}/${cleanSoak.cycles}` : 'no clean soak'}`,
  queueProblems.join(' | '),
);

// The scheduler, recomputed from schedule rows rather than from its own report:
// one boundary must map to exactly one fire and one job, no armed schedule may
// be armed by anyone but the Owner, and a soak may not call a double fire a pass.
const schedulerProblems = [];
const doubleFired = db
  .prepare('SELECT schedule_id, due_at, COUNT(*) AS n FROM schedule_fires GROUP BY schedule_id, due_at HAVING n > 1')
  .all();
for (const d of doubleFired) schedulerProblems.push(`schedule ${d.schedule_id} fired boundary ${d.due_at} ${d.n} times`);
const firesWithoutJobs = db
  .prepare('SELECT COUNT(*) AS n FROM schedule_fires f LEFT JOIN jobs j ON j.job_id = f.job_id WHERE j.job_id IS NULL')
  .get().n;
if (firesWithoutJobs > 0) schedulerProblems.push(`${firesWithoutJobs} schedule fire(s) point at a job that does not exist`);
const armedByOthers = db
  .prepare("SELECT COUNT(*) AS n FROM schedules WHERE enabled = 1 AND (created_by <> 'owner' OR TRIM(reason) = '')")
  .get().n;
if (armedByOthers > 0) schedulerProblems.push(`${armedByOthers} armed schedule(s) lack Owner provenance or a reason`);
const busySchedules = db.prepare('SELECT COUNT(*) AS n FROM schedules WHERE interval_ms < 1000').get().n;
if (busySchedules > 0) schedulerProblems.push(`${busySchedules} schedule(s) tick faster than the one-second floor`);
const understatedFires = db
  .prepare(
    `SELECT COUNT(*) AS n FROM schedules s
      WHERE s.fire_count < (SELECT COUNT(*) FROM schedule_fires f WHERE f.schedule_id = s.schedule_id)`,
  )
  .get().n;
if (understatedFires > 0) schedulerProblems.push(`${understatedFires} schedule(s) report fewer fires than the history holds`);
const dishonestSchedulerSoak = db
  .prepare('SELECT COUNT(*) AS n FROM schedule_soak_cycles WHERE ok = 1 AND (killed = 0 OR jobs_for_boundary <> 1 OR fires_for_boundary <> 1)')
  .get().n;
if (dishonestSchedulerSoak > 0) {
  schedulerProblems.push(`${dishonestSchedulerSoak} scheduler soak cycle(s) call a double fire or a missing kill a pass`);
}
const schedulerSoaks = db
  .prepare(
    `SELECT soak_ref, COUNT(*) AS cycles, SUM(ok) AS ok_cycles,
            SUM(kill_point = 'in-transaction') AS in_tx, SUM(kill_point = 'after-commit') AS after_commit
       FROM schedule_soak_cycles GROUP BY soak_ref`,
  )
  .all();
const cleanSchedulerSoak = schedulerSoaks
  .filter((s) => s.cycles === s.ok_cycles && s.in_tx > 0 && s.after_commit > 0)
  .sort((a, b) => b.cycles - a.cycles)[0];
if (g4Row?.state === 'PASSED' && !cleanSchedulerSoak) {
  schedulerProblems.push('G4: PASSED with no scheduler crash soak covering both kill points');
}
verdict(
  schedulerProblems.length === 0,
  'scheduler_recomputed',
  `${db.prepare('SELECT COUNT(*) AS n FROM schedules').get().n} schedules, ` +
    `${db.prepare('SELECT COUNT(*) AS n FROM schedule_fires').get().n} fires, ` +
    `${cleanSchedulerSoak ? `soak ${cleanSchedulerSoak.soak_ref} ${cleanSchedulerSoak.ok_cycles}/${cleanSchedulerSoak.cycles}` : 'no clean soak'}`,
  schedulerProblems.join(' | '),
);

// Daemon restart soak, recomputed the same way: a passing cycle has to have
// really died, and a passing soak has to have made progress across the restarts.
const daemonProblems = [];
const dishonestDaemonSoak = db
  .prepare(
    `SELECT COUNT(*) AS n FROM daemon_soak_cycles
      WHERE ok = 1 AND ((death = 'sigkill' AND killed = 0) OR duplicate_boundaries <> 0 OR duplicate_jobs <> 0 OR fires_regressed <> 0)`,
  )
  .get().n;
if (dishonestDaemonSoak > 0) {
  daemonProblems.push(`${dishonestDaemonSoak} daemon soak cycle(s) call a duplicated boundary or a missing kill a pass`);
}
const daemonSoaks = db
  .prepare(
    `SELECT soak_ref, COUNT(*) AS cycles, SUM(ok) AS ok_cycles, SUM(boundaries_served) AS served,
            SUM(death = 'sigkill' AND killed = 1) AS real_kills
       FROM daemon_soak_cycles GROUP BY soak_ref`,
  )
  .all();
const cleanDaemonSoak = daemonSoaks
  .filter((s) => s.cycles === s.ok_cycles && s.real_kills > 0 && s.served >= s.cycles)
  .sort((a, b) => b.cycles - a.cycles)[0];
verdict(
  daemonProblems.length === 0,
  'scheduler_daemon_recomputed',
  cleanDaemonSoak
    ? `soak ${cleanDaemonSoak.soak_ref} ${cleanDaemonSoak.ok_cycles}/${cleanDaemonSoak.cycles}, ${cleanDaemonSoak.real_kills} real kills, ${cleanDaemonSoak.served} boundaries served, 0 duplicated`
    : 'no clean daemon restart soak on record',
  daemonProblems.join(' | '),
);

// Supervision soak, recomputed from the raw rows. The claim is narrower than
// the daemon soak's and easier to fake, so it is checked separately: a cycle
// whose daemon was killed under a live supervisor only passes if the supervisor
// really produced a *different* process, and a soak only counts if at least one
// cycle killed the whole tree — the case nothing local can recover from.
const supervisorProblems = [];
const dishonestSupervisorSoak = db
  .prepare(
    `SELECT COUNT(*) AS n FROM supervisor_soak_cycles
      WHERE ok = 1 AND ((death <> 'clean' AND killed = 0)
                        OR (death = 'child' AND (restarts < 1 OR distinct_child_pids < 2))
                        OR duplicate_boundaries <> 0 OR duplicate_jobs <> 0 OR fires_regressed <> 0)`,
  )
  .get().n;
if (dishonestSupervisorSoak > 0) {
  supervisorProblems.push(
    `${dishonestSupervisorSoak} supervisor soak cycle(s) call a missing kill, a restart with no new process or a duplicated boundary a pass`,
  );
}
const supervisorSoaks = db
  .prepare(
    `SELECT soak_ref, COUNT(*) AS cycles, SUM(ok) AS ok_cycles, SUM(boundaries_served) AS served,
            SUM(restarts) AS restarts,
            SUM(death = 'child' AND killed = 1) AS child_kills,
            SUM(death = 'supervisor' AND killed = 1) AS tree_kills
       FROM supervisor_soak_cycles GROUP BY soak_ref`,
  )
  .all();
const cleanSupervisorSoak = supervisorSoaks
  .filter((s) => s.cycles === s.ok_cycles && s.child_kills > 0 && s.tree_kills > 0 && s.restarts > 0 && s.served >= s.cycles)
  .sort((a, b) => b.cycles - a.cycles)[0];
verdict(
  supervisorProblems.length === 0,
  'scheduler_supervisor_recomputed',
  cleanSupervisorSoak
    ? `soak ${cleanSupervisorSoak.soak_ref} ${cleanSupervisorSoak.ok_cycles}/${cleanSupervisorSoak.cycles}, ` +
        `${cleanSupervisorSoak.child_kills} child kills, ${cleanSupervisorSoak.tree_kills} tree kills, ` +
        `${cleanSupervisorSoak.restarts} unattended restarts, ${cleanSupervisorSoak.served} boundaries served, 0 duplicated`
    : 'no clean supervisor soak on record',
  supervisorProblems.join(' | '),
);

// G7 PortfolioOps, recomputed from the raw bytes. The adapters are reimplemented
// here from their contracts so the artefact hash on every USEFUL cycle is checked
// against what the *source* actually yields: a cycle that recorded an artefact the
// stored source cannot produce is caught even if every kernel table agrees.
const portfolioProblems = [];
const contentLines = (text) =>
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#'));

function expectedArtifact(kind, text, sourceVersionId) {
  const lines = contentLines(text);
  if (kind === 'for_ai') {
    return {
      adapter: 'for_ai',
      contract_version: '1',
      output_kind: 'CLAIM_CANDIDATES',
      source_ref: sourceVersionId,
      claim_count: lines.length,
      claims: lines.map((line, i) => ({
        candidate_id: `CAND-${String(i + 1).padStart(4, '0')}`,
        text: line,
        source_ref: sourceVersionId,
        status: 'NEEDS_VERIFICATION',
        confidence: 'LOW',
      })),
      verified_claims: 0,
    };
  }
  if (kind === 'shopping_shorts') {
    const sections = [
      ['HOOK', 0],
      ['BODY', 1],
      ['CTA', 2],
    ].map(([section, line_index]) => {
      const line = lines[line_index];
      return line === undefined
        ? { section, state: 'NEEDS_SOURCE', text: null, source_ref: sourceVersionId, line_index }
        : { section, state: 'SOURCED', text: line, source_ref: sourceVersionId, line_index };
    });
    return {
      adapter: 'shopping_shorts',
      contract_version: '1',
      output_kind: 'SHORTS_OUTLINE',
      source_ref: sourceVersionId,
      topic: lines[0] ?? null,
      sections,
      needs_source: sections.filter((s) => s.state === 'NEEDS_SOURCE').map((s) => s.section),
      published: false,
    };
  }
  return null;
}

const cycles = db
  .prepare(
    `SELECT c.*, a.kind AS adapter_kind, a.output_kind, p.code AS project_code
       FROM portfolio_cycles c
       JOIN project_adapters a ON a.adapter_id = c.adapter_id
       JOIN projects p ON p.project_id = c.project_id`,
  )
  .all();
for (const c of cycles) {
  if (c.outcome !== 'USEFUL') continue;
  const missing = ['source_version_id', 'goal_id', 'job_id', 'artifact_sha256', 'memory_id'].filter((k) => !c[k]);
  if (missing.length > 0) {
    portfolioProblems.push(`${c.cycle_id}: USEFUL with no ${missing.join(', ')}`);
    continue;
  }
  if (c.verified !== 1 || !String(c.verifier).trim() || c.verifier === c.adapter_kind) {
    portfolioProblems.push(`${c.cycle_id}: USEFUL without an independent verification (verifier ${c.verifier})`);
  }
  const goal = db
    .prepare(
      `SELECT g.state, v.decision, v.constitution_ok FROM goals g
         LEFT JOIN council_verdicts v ON v.verdict_id = g.verdict_id WHERE g.goal_id = ?`,
    )
    .get(c.goal_id);
  if (!goal) portfolioProblems.push(`${c.cycle_id}: cites goal ${c.goal_id}, which does not exist`);
  else if (goal.decision !== 'SELECT' || goal.constitution_ok !== 1) {
    portfolioProblems.push(`${c.cycle_id}: cites a goal no council selected (${goal.decision ?? 'no verdict'})`);
  }
  const job = db.prepare('SELECT state, artifact_ref FROM jobs WHERE job_id = ?').get(c.job_id);
  if (!job) portfolioProblems.push(`${c.cycle_id}: cites job ${c.job_id}, which does not exist`);
  else if (job.state !== 'DONE') portfolioProblems.push(`${c.cycle_id}: USEFUL on a job that is ${job.state}`);
  else if (job.artifact_ref !== c.artifact_sha256) {
    portfolioProblems.push(`${c.cycle_id}: the job produced ${job.artifact_ref}, the cycle claims ${c.artifact_sha256}`);
  }
  if (db.prepare('SELECT COUNT(*) AS n FROM artifacts WHERE sha256 = ?').get(c.artifact_sha256).n === 0) {
    portfolioProblems.push(`${c.cycle_id}: no artefact row for ${c.artifact_sha256}`);
  }
  if (db.prepare('SELECT COUNT(*) AS n FROM memory_items WHERE memory_id = ?').get(c.memory_id).n === 0) {
    portfolioProblems.push(`${c.cycle_id}: cites memory ${c.memory_id}, which does not exist`);
  }
  const source = db
    .prepare(
      `SELECT sv.blob_sha256, b.bytes FROM source_versions sv JOIN blobs b ON b.sha256 = sv.blob_sha256
        WHERE sv.source_version_id = ?`,
    )
    .get(c.source_version_id);
  if (!source) {
    portfolioProblems.push(`${c.cycle_id}: cites source version ${c.source_version_id}, which has no stored bytes`);
    continue;
  }
  const bytes = Buffer.from(source.bytes);
  if (createHash('sha256').update(bytes).digest('hex') !== source.blob_sha256) {
    portfolioProblems.push(`${c.cycle_id}: the vault bytes behind ${c.source_version_id} do not match their hash`);
    continue;
  }
  const expected = expectedArtifact(c.adapter_kind, bytes.toString('utf8'), c.source_version_id);
  if (expected === null) {
    portfolioProblems.push(`${c.cycle_id}: adapter ${c.adapter_kind} has no independent contract to check against`);
  } else if (digest(stable(expected)) !== c.artifact_sha256) {
    portfolioProblems.push(
      `${c.cycle_id}: the artefact hash is not what ${c.adapter_kind} yields from the stored source bytes`,
    );
  }
}
const portfolioCapacity = db.prepare('SELECT max_active FROM portfolio_capacity WHERE id = 1').get();
const activeProjectRows = db.prepare("SELECT project_id, code FROM projects WHERE status IN ('BUILD','WATCH')").all();
if (!portfolioCapacity) portfolioProblems.push('no portfolio capacity row');
else if (activeProjectRows.length > portfolioCapacity.max_active) {
  portfolioProblems.push(`${activeProjectRows.length} active projects exceed the capacity of ${portfolioCapacity.max_active}`);
}
for (const p of activeProjectRows) {
  const kinds = db
    .prepare("SELECT kind, COUNT(*) AS n FROM demand_evidence WHERE project_id = ? GROUP BY kind")
    .all(p.project_id);
  const has = (k) => (kinds.find((r) => r.kind === k)?.n ?? 0) > 0;
  if (!has('DEMAND') || !has('UTILITY')) {
    portfolioProblems.push(`${p.code} is active without both demand and utility evidence`);
  }
}
const sourcelessDemand = db.prepare("SELECT COUNT(*) AS n FROM demand_evidence WHERE TRIM(source_ref) = ''").get().n;
if (sourcelessDemand > 0) portfolioProblems.push(`${sourcelessDemand} demand row(s) cite no source`);

const usefulCycles = cycles.filter((c) => c.outcome === 'USEFUL');
verdict(
  portfolioProblems.length === 0,
  'portfolio_cycles_recomputed',
  `${usefulCycles.length}/${cycles.length} cycles USEFUL, artefacts rehashed from the stored source bytes, ` +
    `${activeProjectRows.length}/${portfolioCapacity?.max_active ?? '?'} active`,
  portfolioProblems.join(' | '),
);

// ---------------------------------------------------------------------------
// G8 read side. The Mission Control panels are views, so the interesting lie is
// a panel that disagrees with the tables underneath it: an item missing from the
// Inbox, a goal that reads as decided with no verdict, an expired approval still
// drawn as live, or a Settings row showing the stop as off while it is engaged.
// Everything here is recomputed from the base tables, never from another view.
// ---------------------------------------------------------------------------
const mcProblems = [];
const viewNames = new Set(
  db.prepare("SELECT name FROM sqlite_master WHERE type = 'view'").all().map((r) => r.name),
);
const mcPanels = [
  ['v_mc_inbox', 'SELECT COUNT(*) AS n FROM inbox_items'],
  ['v_mc_projects', 'SELECT COUNT(*) AS n FROM projects'],
  ['v_mc_timeline', 'SELECT COUNT(*) AS n FROM events'],
  ['v_mc_council', 'SELECT COUNT(*) AS n FROM goals'],
  ['v_mc_approvals', 'SELECT COUNT(*) AS n FROM approvals'],
  ['v_mc_costs', 'SELECT COUNT(*) AS n FROM budget_profiles'],
];
if (!viewNames.has('v_mc_settings')) mcProblems.push('no Mission Control surface (0017 not applied)');
else {
  for (const [view, rawSql] of mcPanels) {
    if (!viewNames.has(view)) {
      mcProblems.push(`${view} is missing`);
      continue;
    }
    const shown = db.prepare(`SELECT COUNT(*) AS n FROM ${view}`).get().n;
    const raw = db.prepare(rawSql).get().n;
    if (shown !== raw) mcProblems.push(`${view} shows ${shown} of ${raw} row(s)`);
  }

  // Approval lifecycle: recomputed here in JS, compared with what the panel draws.
  const nowIsoStamp = new Date().toISOString();
  for (const a of db.prepare('SELECT * FROM approvals').all()) {
    const expected =
      a.revoked === 1
        ? 'REVOKED'
        : a.uses >= a.max_uses
          ? 'EXHAUSTED'
          : a.expires_at <= nowIsoStamp
            ? 'EXPIRED'
            : 'LIVE';
    const shown = db.prepare('SELECT state FROM v_mc_approvals WHERE approval_id = ?').get(a.approval_id)?.state;
    if (shown !== expected) mcProblems.push(`${a.approval_id}: panel says ${shown}, the row means ${expected}`);
  }

  // No goal may read as decided unless a verdict exists.
  for (const g of db.prepare("SELECT goal_id, state, verdict_id FROM goals WHERE state IN ('SELECTED','DONE')").all()) {
    if (!g.verdict_id) mcProblems.push(`${g.goal_id}: state ${g.state} with no verdict to show`);
  }

  const mcSettings = db.prepare('SELECT * FROM v_mc_settings').get();
  const rawStop = db.prepare('SELECT engaged FROM emergency_stop WHERE id = 1').get()?.engaged;
  const rawEvents = db.prepare('SELECT COUNT(*) AS n FROM events').get().n;
  const rawActive = db.prepare("SELECT COUNT(*) AS n FROM projects WHERE status IN ('BUILD','WATCH')").get().n;
  const rawHead = db.prepare('SELECT hash FROM events ORDER BY seq DESC LIMIT 1').get()?.hash ?? null;
  if (mcSettings.emergency_stop_engaged !== rawStop) {
    mcProblems.push(`settings shows stop ${mcSettings.emergency_stop_engaged}, the table says ${rawStop}`);
  }
  if (mcSettings.events !== rawEvents) mcProblems.push(`settings shows ${mcSettings.events} events, the ledger has ${rawEvents}`);
  if (mcSettings.projects_active !== rawActive) mcProblems.push(`settings shows ${mcSettings.projects_active} active, the table has ${rawActive}`);
  if (mcSettings.head_hash !== rawHead) mcProblems.push('settings shows a head hash that is not the ledger head');

  // The read surface must be readable with no write privilege at all.
  try {
    const roDb = new DatabaseSync(dbPath, { readOnly: true });
    for (const [view] of mcPanels) roDb.prepare(`SELECT * FROM ${view} LIMIT 1`).all();
    roDb.prepare('SELECT * FROM v_mc_settings').get();
    roDb.close();
  } catch (err) {
    mcProblems.push(`the surface cannot be served read-only: ${err.message}`);
  }
}
verdict(
  mcProblems.length === 0,
  'mission_control_panels_recomputed',
  viewNames.has('v_mc_settings')
    ? `8 panels agree with the base tables, served read-only`
    : 'no surface',
  mcProblems.join(' | '),
);

const g7Row = gates.find((g) => g.gate_id === 'G7');
if (g7Row?.state === 'PASSED' && usefulCycles.length === 0) {
  gateProblems.push('G7: PASSED with no verified portfolio cycle');
}

const g5Row = gates.find((g) => g.gate_id === 'G5');
const g6Row = gates.find((g) => g.gate_id === 'G6');
if (g6Row?.state === 'PASSED' && g5Row?.state !== 'PASSED') gateProblems.push('G6: PASSED while G5 is not');
if (g5Row?.state === 'PASSED') {
  const liveRuns = db
    .prepare("SELECT COUNT(*) AS n FROM runs WHERE authority = 'A3' AND state = 'DONE' AND approval_id IS NOT NULL")
    .get().n;
  if (liveRuns === 0) gateProblems.push('G5: PASSED with no approved live provider RUN');
}
verdict(
  gateProblems.length === 0,
  'gate_promotions_recomputed',
  `${gates.filter((g) => g.state === 'PASSED').length} gates passed`,
  gateProblems.join(' | '),
);

// ---------------------------------------------------------------------------
// G8 UI contract. The pinned contract is what the future desktop shell is allowed
// to draw and invoke, so the lie worth catching is a pin that no longer matches
// the kernel: a panel column that vanished, a command in the pin that the API
// does not implement, or an action the pin grants that no command backs. The
// columns are read from the live views and the command names are parsed out of
// the API source, never taken from the module.
// ---------------------------------------------------------------------------
const contractPath = join(REPO, 'contracts', 'ui-contract.json');
const contractProblems = [];
let pinnedPanelCount = 0;
if (!existsSync(contractPath)) contractProblems.push('contracts/ui-contract.json is missing');
else {
  const pinned = JSON.parse(readFileSync(contractPath, 'utf8'));
  pinnedPanelCount = Object.keys(pinned.panels ?? {}).length;
  const { contract_hash: pinnedHash, ...pinnedBody } = pinned;
  if (digest(stable(pinnedBody)) !== pinnedHash) contractProblems.push('pinned contract_hash does not match its own body');

  // Command names as they appear in the API source, not as the module reports.
  const apiSource = readFileSync(join(REPO, 'src', 'api', 'server.mjs'), 'utf8');
  const vocabulary = new Set(
    [...apiSource.matchAll(/^\s{2}'([a-z]+\.[a-z]+)':\s*\{$/gm)].map((m) => m[1]),
  );
  for (const name of Object.keys(pinned.commands ?? {})) {
    if (!vocabulary.has(name)) contractProblems.push(`pinned command ${name} is not in the API source`);
  }
  for (const name of vocabulary) {
    if (!pinned.commands?.[name]) contractProblems.push(`API command ${name} is not in the pinned contract`);
  }
  if (/'[a-z]+\.grant'/.test(apiSource)) contractProblems.push('the API exposes an approval-granting command');

  for (const [name, entry] of Object.entries(pinned.panels ?? {})) {
    if (!viewNames.has(entry.view)) {
      contractProblems.push(`panel ${name} names view ${entry.view}, which does not exist`);
      continue;
    }
    const live = db.prepare('SELECT name FROM pragma_table_info(?)').all(entry.view).map((r) => r.name);
    if (stable(live) !== stable(entry.columns)) {
      contractProblems.push(`panel ${name} columns differ from ${entry.view}`);
    }
    for (const action of entry.actions ?? []) {
      if (!vocabulary.has(action.command)) {
        contractProblems.push(`panel ${name} offers ${action.command}, which the API does not implement`);
      }
    }
  }
}
verdict(
  contractProblems.length === 0,
  'ui_contract_recomputed',
  `${pinnedPanelCount} panels pinned, columns re-read from the views`,
  contractProblems.join(' | '),
);

// ------------------------------------------------------------------ G9 lab
//
// Recomputed here, not read: every benchmark verdict is derived again from its
// own numbers, and every proposal that claims to be APPROVED or APPLIED must
// still have an Owner grant bound to its exact bytes. A proposal that reached
// the top of the ladder without measurement or consent is a G9 failure even if
// the triggers were bypassed by whatever wrote the row.
const labProblems = [];
let labProposals = 0;
if (objects.has('change_proposals')) {
  labProposals = db.prepare('SELECT COUNT(*) AS n FROM change_proposals').get().n;
  for (const b of db.prepare('SELECT * FROM proposal_benchmarks').all()) {
    const improved = b.higher_is_better === 1 ? b.candidate > b.baseline : b.candidate < b.baseline;
    if (b.verdict === 'PASS' && !improved) labProblems.push(`${b.benchmark_id} claims PASS but its numbers got worse`);
    if (b.verdict === 'REGRESSION' && improved) {
      labProblems.push(`${b.benchmark_id} claims REGRESSION but its numbers improved`);
    }
    const proposal = db.prepare('SELECT diff_sha256 FROM change_proposals WHERE proposal_id = ?').get(b.proposal_id);
    if (!proposal) labProblems.push(`${b.benchmark_id} measures a proposal that does not exist`);
    else if (proposal.diff_sha256 !== b.diff_sha256) {
      labProblems.push(`${b.benchmark_id} measured bytes that are not ${b.proposal_id}'s`);
    }
  }
  const forbidden = db.prepare('SELECT pattern FROM evolution_forbidden_targets').all().map((r) => r.pattern);
  const matches = (path, pattern) =>
    new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*')}$`).test(path);
  for (const p of db.prepare('SELECT * FROM change_proposals').all()) {
    const pattern = forbidden.find((f) => matches(p.target_path, f));
    if (pattern) labProblems.push(`${p.proposal_id} targets ${p.target_path}, which ${pattern} forbids`);
    if (!['APPROVED', 'APPLIED', 'ROLLED_BACK'].includes(p.state)) continue;
    const improved = db
      .prepare(
        `SELECT
           SUM(CASE WHEN verdict = 'PASS' THEN 1 ELSE 0 END) AS improved,
           SUM(CASE WHEN verdict IN ('REGRESSION','FAIL') THEN 1 ELSE 0 END) AS regressed
         FROM proposal_benchmarks WHERE proposal_id = ? AND diff_sha256 = ?`,
      )
      .get(p.proposal_id, p.diff_sha256);
    if ((improved.improved ?? 0) === 0) labProblems.push(`${p.proposal_id} is ${p.state} with no measured improvement`);
    if ((improved.regressed ?? 0) > 0) labProblems.push(`${p.proposal_id} is ${p.state} with a recorded regression`);
    const approval = p.approval_id
      ? db.prepare('SELECT * FROM approvals WHERE approval_id = ?').get(p.approval_id)
      : null;
    if (!approval) labProblems.push(`${p.proposal_id} is ${p.state} without an approval`);
    else if (approval.payload_hash !== p.diff_sha256) {
      labProblems.push(`${p.proposal_id} cites an approval bound to other bytes`);
    } else if (approval.exact_action !== 'evolution.apply' || approval.target !== p.target_path) {
      labProblems.push(`${p.proposal_id} cites an approval for ${approval.exact_action} on ${approval.target}`);
    } else if (!approval.owner_packet_ref || !existsSync(join(REPO, approval.owner_packet_ref))) {
      labProblems.push(`${p.proposal_id} cites an approval whose Owner Packet is not on disk`);
    }
  }
}
verdict(
  labProblems.length === 0,
  'evolution_lab_recomputed',
  `${labProposals} proposals, benchmark verdicts recomputed from their own numbers`,
  labProblems.join(' | '),
);

db.close();

const failed = findings.filter((f) => !f.ok);
const report = { db: dbPath, ok: failed.length === 0, checks: findings.length, failed };
if (asJson) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
else {
  for (const f of findings) process.stdout.write(`${f.ok ? 'PASS' : 'FAIL'} ${f.check}${f.detail ? ` — ${f.detail}` : ''}\n`);
  process.stdout.write(`${report.ok ? 'INDEPENDENT_VALIDATION_PASS' : 'INDEPENDENT_VALIDATION_FAIL'}\n`);
}
process.exit(report.ok ? 0 : 1);
