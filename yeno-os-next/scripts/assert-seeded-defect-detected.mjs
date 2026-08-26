#!/usr/bin/env node
// Seeded-defect harness: proves the validators actually detect damage instead
// of printing green. Each case builds a throwaway kernel, injects one specific
// defect, and requires the matching validator to fail.
import { mkdtempSync, rmSync, copyFileSync, writeFileSync, readFileSync, mkdirSync, readdirSync, openSync, writeSync, closeSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { openDb } from '../src/core/db.mjs';
import { migrate } from '../src/core/migrate.mjs';
import { appendEvent } from '../src/core/events.mjs';
import { catchUp } from '../src/core/projections.mjs';
import { createBackup, verifyBackup } from '../src/core/backup.mjs';
import { setStop } from '../src/core/governor.mjs';
import { ingest, registerParsers } from '../src/domain/intake.mjs';
import { observe } from '../src/domain/self.mjs';
import { registerAdapter, runPortfolioCycle } from '../src/domain/portfolio.mjs';
import { makeArtifactVerifier } from '../src/domain/portfolio-verifier.mjs';

const REPO = new URL('..', import.meta.url).pathname;
const MIGRATIONS = join(REPO, 'migrations');
const VALIDATOR = join(REPO, 'scripts', 'independent-validation.mjs');

function scaffold() {
  const dir = mkdtempSync(join(tmpdir(), 'yeno-defect-'));
  const migDir = join(dir, 'migrations');
  mkdirSync(migDir, { recursive: true });
  for (const f of readdirSync(MIGRATIONS)) {
    copyFileSync(join(MIGRATIONS, f), join(migDir, f));
  }
  const dbPath = join(dir, 'yeno.db');
  const db = openDb(dbPath);
  migrate(db, migDir);
  for (let i = 1; i <= 4; i += 1) {
    appendEvent(db, {
      eventId: `EVT-seed-${i}`,
      type: 'inbox.recorded',
      actor: 'seed',
      authority: 'A2',
      payload: { inbox_id: `IN-${i}`, title: `seed ${i}`, state: 'BODY_MISSING' },
    });
  }
  catchUp(db);
  return { dir, dbPath, migDir, db };
}

function runValidator(dbPath, migDir) {
  return spawnSync(process.execPath, [VALIDATOR, '--db', dbPath, '--migrations', migDir], { encoding: 'utf8' });
}

const results = [];

function record(name, detected, detail) {
  results.push({ name, detected, detail });
  process.stdout.write(`${detected ? 'DETECTED' : 'MISSED  '} ${name}${detail ? ` — ${detail}` : ''}\n`);
}

// Case 1: a clean kernel must pass, otherwise the harness itself is broken.
{
  const s = scaffold();
  s.db.close();
  const run = runValidator(s.dbPath, s.migDir);
  record('control_clean_kernel_passes', run.status === 0, run.status === 0 ? '' : run.stdout.trim());
  rmSync(s.dir, { recursive: true, force: true });
}

// Case 2: tampered event payload after dropping the append-only trigger.
{
  const s = scaffold();
  s.db.exec('DROP TRIGGER trg_events_no_update');
  s.db.exec(`UPDATE events SET payload = '{"inbox_id":"IN-1","title":"forged","state":"PROMOTED"}' WHERE seq = 1`);
  s.db.close();
  const run = runValidator(s.dbPath, s.migDir);
  record('event_payload_tampered', run.status !== 0 && /event_hash/.test(run.stdout), run.stdout.match(/FAIL .*/)?.[0] ?? '');
  rmSync(s.dir, { recursive: true, force: true });
}

// Case 3: an event deleted from the middle of the ledger.
{
  const s = scaffold();
  s.db.exec('DROP TRIGGER trg_events_no_delete');
  s.db.exec('DELETE FROM events WHERE seq = 2');
  s.db.close();
  const run = runValidator(s.dbPath, s.migDir);
  record('event_deleted', run.status !== 0 && /event_seq_contiguous|event_prev_hash/.test(run.stdout), run.stdout.match(/FAIL .*/)?.[0] ?? '');
  rmSync(s.dir, { recursive: true, force: true });
}

// Case 4: a projection row edited so it no longer follows from the ledger.
{
  const s = scaffold();
  s.db.exec("UPDATE proj_inbox_state SET state = 'PROMOTED' WHERE inbox_id = 'IN-3'");
  s.db.close();
  const run = runValidator(s.dbPath, s.migDir);
  record('projection_hand_edited', run.status !== 0 && /projection_matches_ledger/.test(run.stdout), run.stdout.match(/FAIL projection.*/)?.[0] ?? '');
  rmSync(s.dir, { recursive: true, force: true });
}

// Case 5: an already-applied migration edited on disk.
{
  const s = scaffold();
  s.db.close();
  const target = join(s.migDir, '0001_core.sql');
  writeFileSync(target, `${readFileSync(target, 'utf8')}\n-- seeded defect\n`);
  const run = runValidator(s.dbPath, s.migDir);
  record('applied_migration_edited', run.status !== 0 && /migration_checksum/.test(run.stdout), run.stdout.match(/FAIL migration.*/)?.[0] ?? '');
  rmSync(s.dir, { recursive: true, force: true });
}

// Case 6: a dropped safety trigger.
{
  const s = scaffold();
  s.db.exec('DROP TRIGGER trg_runs_cost_hard_gate');
  s.db.close();
  const run = runValidator(s.dbPath, s.migDir);
  record('safety_trigger_dropped', run.status !== 0 && /safety_object_present/.test(run.stdout), run.stdout.match(/FAIL safety.*/)?.[0] ?? '');
  rmSync(s.dir, { recursive: true, force: true });
}

// Case 7: vault bytes replaced without updating the content address.
{
  const s = scaffold();
  const now = new Date().toISOString();
  s.db.prepare('INSERT INTO blobs (sha256, size_bytes, bytes, created_at) VALUES (?, ?, ?, ?)').run(
    'f'.repeat(64),
    5,
    Buffer.from('hello'),
    now,
  );
  s.db.prepare("INSERT INTO sources (source_id, kind, origin_ref, created_at) VALUES ('SRC-1','FILE','seed',?)").run(now);
  s.db
    .prepare(
      `INSERT INTO source_versions (source_version_id, source_id, blob_sha256, parser_version, provenance_json, fetched_at, confidence)
       VALUES ('SV-1','SRC-1',?, 'p1', '{}', ?, 'RAW')`,
    )
    .run('f'.repeat(64), now);
  s.db.close();
  const run = runValidator(s.dbPath, s.migDir);
  record('vault_bytes_mismatch', run.status !== 0 && /vault_bytes_rehashed/.test(run.stdout), run.stdout.match(/FAIL vault.*/)?.[0] ?? '');
  rmSync(s.dir, { recursive: true, force: true });
}

// Case 8: a project promoted from a title with neither a recovered body nor an
// Owner confirmation. The schema refuses this, so the defect is injected with
// triggers off — exactly the state a stray writer or a restored bad backup would
// leave behind, and the coverage invariant must still catch it afterwards.
{
  const s = scaffold();
  const now = new Date().toISOString();
  s.db.prepare(
    `INSERT INTO inbox_items (inbox_id, title, source_version_id, state, attempts, next_action, created_at, updated_at)
     VALUES ('IN-TITLE','title only', NULL, 'BODY_MISSING', 0, 'await official export', ?, ?)`,
  ).run(now, now);
  s.db.exec('DROP TRIGGER trg_projects_promotion_needs_evidence');
  s.db.prepare(
    `INSERT INTO projects (project_id, code, name, status, priority_raw, promoted_from_inbox, created_at, updated_at)
     VALUES ('PRJ-FORGED','FORGED','title only','REGISTRY',0,'IN-TITLE', ?, ?)`,
  ).run(now, now);
  s.db.close();
  const run = runValidator(s.dbPath, s.migDir);
  record(
    'title_only_project_promoted',
    run.status !== 0 && /intake_coverage_recomputed/.test(run.stdout),
    run.stdout.match(/FAIL intake_coverage.*/)?.[0] ?? '',
  );
  rmSync(s.dir, { recursive: true, force: true });
}

// Case 9: an inbox item marked RECOVERED with no recovery attempt behind it.
{
  const s = scaffold();
  const now = new Date().toISOString();
  s.db.prepare('INSERT INTO blobs (sha256, size_bytes, bytes, created_at) VALUES (?, ?, ?, ?)').run(
    'c'.repeat(64),
    5,
    Buffer.from('hello'),
    now,
  );
  s.db.prepare("INSERT INTO sources (source_id, kind, origin_ref, created_at) VALUES ('SRC-R','FILE','seed',?)").run(now);
  s.db
    .prepare(
      `INSERT INTO source_versions (source_version_id, source_id, blob_sha256, parser_version, provenance_json, fetched_at, confidence)
       VALUES ('SV-R','SRC-R', ?, 'plain-file/v1', '{}', ?, 'PARSED')`,
    )
    .run('c'.repeat(64), now);
  s.db.exec('DROP TRIGGER trg_inbox_recovered_needs_attempt');
  s.db.prepare(
    `INSERT INTO inbox_items (inbox_id, title, source_version_id, state, attempts, next_action, created_at, updated_at)
     VALUES ('IN-CLAIMED','claims a body', 'SV-R', 'RECOVERED', 1, 'owner review', ?, ?)`,
  ).run(now, now);
  s.db.close();
  const run = runValidator(s.dbPath, s.migDir);
  record(
    'recovered_without_attempt',
    run.status !== 0 && /intake_coverage_recomputed/.test(run.stdout),
    run.stdout.match(/FAIL intake_coverage.*/)?.[0] ?? '',
  );
  rmSync(s.dir, { recursive: true, force: true });
}

// Case 10: a red-team bypass that actually worked must fail the governor check.
{
  const s = scaffold();
  s.db
    .prepare(
      `INSERT INTO redteam_probes (probe_id, suite_ref, ts, bypass_class, attack, outcome, detail)
       VALUES ('RT-seed','seed', ?, 'LEASE', 'stole a held lease', 'ALLOWED', 'changed 1 row')`,
    )
    .run(new Date().toISOString());
  s.db.close();
  const run = runValidator(s.dbPath, s.migDir);
  record(
    'redteam_bypass_allowed',
    run.status !== 0 && /governor_recomputed/.test(run.stdout),
    run.stdout.match(/FAIL governor_recomputed.*/)?.[0] ?? '',
  );
  rmSync(s.dir, { recursive: true, force: true });
}

// Case 11: a high-authority RUN with no Owner approval, trigger removed.
{
  const s = scaffold();
  const now = new Date().toISOString();
  s.db.exec('DROP TRIGGER trg_runs_high_authority_needs_approval');
  s.db.exec('DROP TRIGGER trg_runs_blocked_by_stop');
  s.db
    .prepare(
      `INSERT INTO runs (run_id, goal, authority, method_class, network, cost_p90_krw, budget_profile_id,
         approval_id, baseline_ref, acceptance, rollback, state, created_at, updated_at)
       VALUES ('RUN-forged','unapproved external effect','A4','SAFE','ALLOWLIST',0,'BP-LOCAL',
               NULL,'BASELINE-20260826','none','none','PENDING', ?, ?)`,
    )
    .run(now, now);
  s.db.close();
  const run = runValidator(s.dbPath, s.migDir);
  record(
    'unapproved_high_authority_run',
    run.status !== 0 && /governor_recomputed/.test(run.stdout),
    run.stdout.match(/FAIL governor_recomputed.*/)?.[0] ?? '',
  );
  rmSync(s.dir, { recursive: true, force: true });
}

// Case 12: a corrupted backup file must be refused by backup verify.
{
  const s = scaffold();
  const backup = await createBackup(s.db, { dir: join(s.dir, 'backups') });
  const size = statSync(backup.path).size;
  const fd = openSync(backup.path, 'r+');
  writeSync(fd, Buffer.from('CORRUPTED'), 0, 9, Math.floor(size / 2));
  closeSync(fd);
  const verification = await verifyBackup(backup.path);
  s.db.close();
  record('corrupted_backup_refused', verification.ok === false, verification.problems.join(' | '));
  rmSync(s.dir, { recursive: true, force: true });
}

// Case 13: two live effect rows for one idempotency key is the duplicate the
// whole of G4 exists to prevent, so the validator must catch it even when the
// guard that normally makes it impossible has been dropped.
{
  const s = scaffold();
  setStop(s.db, false, 'seeded-defect harness: exercising the queue on a throwaway kernel', 'owner');
  s.db.exec('DROP INDEX idx_effects_live_key');
  s.db.exec("INSERT INTO jobs (job_id, queue, kind, payload_json, payload_hash, dedupe_key, authority, state, available_at, created_at, updated_at) VALUES ('JOB-seed','default','seed','{}','" + 'a'.repeat(64) + "','seed','A2','READY','2026-08-26T00:00:00Z','2026-08-26T00:00:00Z','2026-08-26T00:00:00Z')");
  for (const id of ['EFF-seed-1', 'EFF-seed-2']) {
    s.db.exec(
      `INSERT INTO external_effects (effect_id, idempotency_key, job_id, attempt, kind, target, payload_hash,
         state, claimed_at, settled_at, evidence_ref)
       VALUES ('${id}','${'b'.repeat(64)}','JOB-seed',1,'http.post','https://example.test','${'c'.repeat(64)}',
               'COMMITTED','2026-08-26T00:00:00Z','2026-08-26T00:00:00Z','evidence/RUN-007.md')`,
    );
  }
  s.db.close();
  const run = runValidator(s.dbPath, s.migDir);
  record(
    'duplicated_external_effect',
    run.status !== 0 && /FAIL workflow_runtime_recomputed/.test(run.stdout),
    run.stdout.match(/FAIL workflow_runtime_recomputed.*/)?.[0] ?? '',
  );
  rmSync(s.dir, { recursive: true, force: true });
}

// Case 14: a crash-soak cycle that calls a duplicated effect a pass is the exact
// lie that would let G4 through on forged durability evidence.
{
  const s = scaffold();
  s.db.exec('DROP TRIGGER trg_queue_soak_honest_verdict');
  s.db.exec(
    `INSERT INTO queue_soak_cycles (cycle_id, soak_ref, cycle, kill_point, job_id, idempotency_key,
       effect_lines, resumed_outcome, ok, detail, observed_at)
     VALUES ('QSC-seed','QSOAK-seed',1,'after-effect','JOB-x','${'d'.repeat(64)}',2,'done',1,
             'seeded lie','2026-08-26T00:00:00Z')`,
  );
  s.db.close();
  const run = runValidator(s.dbPath, s.migDir);
  record(
    'soak_cycle_calls_duplicate_a_pass',
    run.status !== 0 && /FAIL workflow_runtime_recomputed/.test(run.stdout),
    run.stdout.match(/FAIL workflow_runtime_recomputed.*/)?.[0] ?? '',
  );
  rmSync(s.dir, { recursive: true, force: true });
}

// Case 15: one boundary that fired twice is the scheduler's version of a
// duplicated external effect, so the validator must catch it from the raw rows.
{
  const s = scaffold();
  // The switches are released on this throwaway kernel only, so the seeded lie
  // is the double fire itself rather than a fire that the guards would refuse.
  setStop(s.db, false, 'seeded-defect harness: seeding a double fire on a throwaway kernel', 'owner');
  s.db.exec(
    `UPDATE scheduler_state SET enabled = 1, reason = 'seeded-defect harness', changed_by = 'owner',
       changed_at = '2026-08-26T00:00:00Z' WHERE id = 1`,
  );
  // UNIQUE(schedule_id, due_at) is what makes a double fire impossible, so the
  // defect is injected by rebuilding the table without it — exactly the mistake
  // a future migration could make — and the validator must still catch the lie.
  s.db.exec('DROP TABLE schedule_fires');
  s.db.exec(
    `CREATE TABLE schedule_fires (
       fire_id TEXT PRIMARY KEY, schedule_id TEXT NOT NULL, due_at TEXT NOT NULL,
       fired_at TEXT NOT NULL, tick_id TEXT NOT NULL, job_id TEXT NOT NULL,
       deduped INTEGER NOT NULL DEFAULT 0
     ) STRICT`,
  );
  s.db.exec(
    `INSERT INTO schedules (schedule_id, name, queue, kind, payload_json, interval_ms,
       enabled, catchup, authority, next_due_at, fire_count, reason, created_by, created_at)
     VALUES ('SCH-seed','seed','default','seed','{}',60000,1,0,'A2',
             '2026-08-26T00:00:00Z',2,'seeded','owner','2026-08-26T00:00:00Z')`,
  );
  s.db.exec("INSERT INTO jobs (job_id, queue, kind, payload_json, payload_hash, dedupe_key, authority, state, available_at, created_at, updated_at) VALUES ('JOB-sched','default','seed','{}','" + 'b'.repeat(64) + "','sched-seed','A2','READY','2026-08-26T00:00:00Z','2026-08-26T00:00:00Z','2026-08-26T00:00:00Z')");
  for (const id of ['SFR-seed-1', 'SFR-seed-2']) {
    s.db.exec(
      `INSERT INTO schedule_fires (fire_id, schedule_id, due_at, fired_at, tick_id, job_id, deduped)
       VALUES ('${id}','SCH-seed','2026-08-26T00:00:00Z','2026-08-26T00:00:00Z','TICK-seed','JOB-sched',0)`,
    );
  }
  s.db.close();
  const run = runValidator(s.dbPath, s.migDir);
  record(
    'schedule_boundary_fired_twice',
    run.status !== 0 && /FAIL scheduler_recomputed/.test(run.stdout),
    run.stdout.match(/FAIL scheduler_recomputed.*/)?.[0] ?? '',
  );
  rmSync(s.dir, { recursive: true, force: true });
}

// Case 16: a scheduler soak cycle that calls a double fire a pass.
{
  const s = scaffold();
  s.db.exec('DROP TRIGGER trg_schedule_soak_honest_verdict');
  s.db.exec(
    `INSERT INTO schedule_soak_cycles (cycle_id, soak_ref, cycle, kill_point, killed,
       jobs_for_boundary, fires_for_boundary, ok, detail, recorded_at)
     VALUES ('SSC-seed','SSOAK-seed',1,'after-commit',1,2,2,1,'seeded lie','2026-08-26T00:00:00Z')`,
  );
  s.db.close();
  const run = runValidator(s.dbPath, s.migDir);
  record(
    'scheduler_soak_calls_double_fire_a_pass',
    run.status !== 0 && /FAIL scheduler_recomputed/.test(run.stdout),
    run.stdout.match(/FAIL scheduler_recomputed.*/)?.[0] ?? '',
  );
  rmSync(s.dir, { recursive: true, force: true });
}

// Case 17: an armed schedule with no Owner behind it.
{
  const s = scaffold();
  s.db.exec('DROP TRIGGER trg_schedules_insert_enabled_needs_owner');
  s.db.exec(
    `INSERT INTO schedules (schedule_id, name, queue, kind, payload_json, interval_ms,
       enabled, catchup, authority, next_due_at, fire_count, reason, created_by, created_at)
     VALUES ('SCH-rogue','rogue','default','seed','{}',60000,1,0,'A2',
             '2026-08-26T00:00:00Z',0,'','attacker','2026-08-26T00:00:00Z')`,
  );
  s.db.close();
  const run = runValidator(s.dbPath, s.migDir);
  record(
    'schedule_armed_without_owner',
    run.status !== 0 && /FAIL scheduler_recomputed/.test(run.stdout),
    run.stdout.match(/FAIL scheduler_recomputed.*/)?.[0] ?? '',
  );
  rmSync(s.dir, { recursive: true, force: true });
}

// Case 18: a daemon restart soak cycle that never really died calling itself a
// pass — the lie a soak harness tells when the kill silently stopped working.
{
  const s = scaffold();
  s.db.exec('DROP TRIGGER trg_daemon_soak_honest_verdict');
  s.db.exec(
    `INSERT INTO daemon_soak_cycles (cycle_id, soak_ref, cycle, death, killed, ran_ms,
       boundaries_served, duplicate_boundaries, duplicate_jobs, fires_regressed, ok, detail, recorded_at)
     VALUES ('DSC-seed','DSOAK-seed',1,'sigkill',0,1000,3,0,0,0,1,'seeded lie','2026-08-26T00:00:00Z')`,
  );
  s.db.close();
  const run = runValidator(s.dbPath, s.migDir);
  record(
    'daemon_soak_claims_a_kill_that_never_happened',
    run.status !== 0 && /FAIL scheduler_daemon_recomputed/.test(run.stdout),
    run.stdout.match(/FAIL scheduler_daemon_recomputed.*/)?.[0] ?? '',
  );
  rmSync(s.dir, { recursive: true, force: true });
}

// Case 19: a daemon soak that served the same boundary twice and passed anyway.
{
  const s = scaffold();
  s.db.exec('DROP TRIGGER trg_daemon_soak_honest_verdict');
  s.db.exec(
    `INSERT INTO daemon_soak_cycles (cycle_id, soak_ref, cycle, death, killed, ran_ms,
       boundaries_served, duplicate_boundaries, duplicate_jobs, fires_regressed, ok, detail, recorded_at)
     VALUES ('DSC-dup','DSOAK-seed',1,'sigkill',1,1000,3,1,0,0,1,'seeded lie','2026-08-26T00:00:00Z')`,
  );
  s.db.close();
  const run = runValidator(s.dbPath, s.migDir);
  record(
    'daemon_soak_calls_a_duplicated_boundary_a_pass',
    run.status !== 0 && /FAIL scheduler_daemon_recomputed/.test(run.stdout),
    run.stdout.match(/FAIL scheduler_daemon_recomputed.*/)?.[0] ?? '',
  );
  rmSync(s.dir, { recursive: true, force: true });
}

// Case 20: a supervisor soak cycle claiming the supervisor replaced a killed
// daemon while only ever running one process — a restart that never happened.
{
  const s = scaffold();
  s.db.exec('DROP TRIGGER trg_supervisor_soak_honest_verdict');
  s.db.exec(
    `INSERT INTO supervisor_soak_cycles (cycle_id, soak_ref, cycle, death, killed, restarts,
       distinct_child_pids, ran_ms, boundaries_served, duplicate_boundaries, duplicate_jobs,
       fires_regressed, ok, detail, recorded_at)
     VALUES ('VSC-seed','VSOAK-seed',1,'child',1,1,1,1000,3,0,0,0,1,'seeded lie','2026-08-26T00:00:00Z')`,
  );
  s.db.close();
  const run = runValidator(s.dbPath, s.migDir);
  record(
    'supervisor_soak_claims_a_restart_with_no_new_process',
    run.status !== 0 && /FAIL scheduler_supervisor_recomputed/.test(run.stdout),
    run.stdout.match(/FAIL scheduler_supervisor_recomputed.*/)?.[0] ?? '',
  );
  rmSync(s.dir, { recursive: true, force: true });
}

// Case 21: a supervisor soak cycle that served the same boundary twice across a
// tree kill and passed anyway — the exactly-once claim quietly abandoned.
{
  const s = scaffold();
  s.db.exec('DROP TRIGGER trg_supervisor_soak_honest_verdict');
  s.db.exec(
    `INSERT INTO supervisor_soak_cycles (cycle_id, soak_ref, cycle, death, killed, restarts,
       distinct_child_pids, ran_ms, boundaries_served, duplicate_boundaries, duplicate_jobs,
       fires_regressed, ok, detail, recorded_at)
     VALUES ('VSC-dup','VSOAK-seed',1,'supervisor',1,0,1,1000,3,1,0,0,1,'seeded lie','2026-08-26T00:00:00Z')`,
  );
  s.db.close();
  const run = runValidator(s.dbPath, s.migDir);
  record(
    'supervisor_soak_calls_a_duplicated_boundary_a_pass',
    run.status !== 0 && /FAIL scheduler_supervisor_recomputed/.test(run.stdout),
    run.stdout.match(/FAIL scheduler_supervisor_recomputed.*/)?.[0] ?? '',
  );
  rmSync(s.dir, { recursive: true, force: true });
}

// G7. These cases need a *real* portfolio cycle first: a lie about a verified
// pass is only interesting if everything around it is genuine.
function scaffoldWithCycle() {
  const s = scaffold();
  setStop(s.db, false, 'seeded defect harness', 'owner');
  registerParsers(s.db);
  const intake = ingest(s.db, {
    bytes: Buffer.from('# seeded source\nthe fare is 1500 KRW\nthe office opens at 09:00\n', 'utf8'),
    kind: 'FILE',
    originRef: 'seed://portfolio/source.md',
    parserId: 'plain-file/v1',
  });
  const at = '2026-08-26T00:00:00Z';
  s.db
    .prepare(
      `INSERT INTO projects (project_id, code, name, program_ug, status, priority_raw, promoted_from_inbox,
         body_evidence_ref, owner_confirmation_ref, created_at, updated_at)
       VALUES ('PRJ-seed','SEED-1','seeded project','UG02','REGISTRY',0,NULL,'seed fixture',NULL,?,?)`,
    )
    .run(at, at);
  registerAdapter(s.db, { projectId: 'PRJ-seed', kind: 'for_ai', enabled: true, note: 'seed' });
  observe(s.db, 'unresolved_inbox', 12);
  const out = runPortfolioCycle(s.db, {
    projectId: 'PRJ-seed',
    adapterKind: 'for_ai',
    sourceVersionId: intake.source_version_id,
    worker: 'seed-worker',
    verify: makeArtifactVerifier({ dbPath: s.dbPath, artifactDir: join(s.dir, 'artifacts') }),
  });
  if (!out.ran || out.cycle.outcome !== 'USEFUL') {
    throw new Error(`seeded portfolio cycle did not pass: ${JSON.stringify(out)}`);
  }
  return { ...s, cycle: out.cycle, sourceVersionId: intake.source_version_id };
}

// Case 22: a verified pass whose artefact is not what the source can produce —
// the exact shape of a fabricated deliverable with a real audit trail around it.
{
  const s = scaffoldWithCycle();
  s.db.exec('DROP TRIGGER trg_portfolio_cycle_append_only');
  s.db
    .prepare('UPDATE portfolio_cycles SET artifact_sha256 = ? WHERE cycle_id = ?')
    .run('f'.repeat(64), s.cycle.cycle_id);
  s.db.prepare('UPDATE jobs SET artifact_ref = ? WHERE job_id = ?').run('f'.repeat(64), s.cycle.job_id);
  // Artefact rows are immutable, so the lie has to bring its own row: the
  // paperwork is complete and only the bytes never existed.
  s.db
    .prepare(
      `INSERT INTO artifacts (artifact_id, job_id, run_id, kind, sha256, size_bytes, path, created_at)
       VALUES ('ART-seeded-lie', ?, NULL, 'portfolio.adapter_output', ?, 1, NULL, '2026-08-26T00:00:00Z')`,
    )
    .run(s.cycle.job_id, 'f'.repeat(64));
  s.db.close();
  const run = runValidator(s.dbPath, s.migDir);
  record(
    'portfolio_cycle_claims_an_artifact_the_source_cannot_produce',
    run.status !== 0 && /FAIL portfolio_cycles_recomputed/.test(run.stdout),
    run.stdout.match(/FAIL portfolio_cycles_recomputed.*/)?.[0] ?? '',
  );
  rmSync(s.dir, { recursive: true, force: true });
}

// Case 23: a verified pass whose goal no council ever selected — work that skipped
// the internal debate but kept the paperwork.
{
  const s = scaffoldWithCycle();
  s.db.prepare('UPDATE goals SET verdict_id = NULL WHERE goal_id = ?').run(s.cycle.goal_id);
  s.db.close();
  const run = runValidator(s.dbPath, s.migDir);
  record(
    'portfolio_cycle_cites_a_goal_no_council_selected',
    run.status !== 0 && /FAIL portfolio_cycles_recomputed/.test(run.stdout),
    run.stdout.match(/FAIL portfolio_cycles_recomputed.*/)?.[0] ?? '',
  );
  rmSync(s.dir, { recursive: true, force: true });
}

// Case 24: a project scaled into active work with no demand and no utility on
// record — growth the Owner's machine never agreed to.
{
  const s = scaffoldWithCycle();
  s.db.exec('DROP TRIGGER trg_project_activation_needs_demand_update');
  s.db.exec("UPDATE projects SET status = 'BUILD' WHERE project_id = 'PRJ-seed'");
  s.db.close();
  const run = runValidator(s.dbPath, s.migDir);
  record(
    'project_is_active_with_no_demand_or_utility_evidence',
    run.status !== 0 && /FAIL portfolio_cycles_recomputed/.test(run.stdout),
    run.stdout.match(/FAIL portfolio_cycles_recomputed.*/)?.[0] ?? '',
  );
  rmSync(s.dir, { recursive: true, force: true });
}

// G8 read side. A dashboard lies by omission and by relabelling, so each case
// rewrites one Mission Control view — exactly what a "small UI fix" would do —
// and the validator must catch the surface drifting from the tables.
// Case 25: the Inbox panel quietly hides the items that have no body.
{
  const s = scaffold();
  s.db.exec(
    `INSERT INTO inbox_items (inbox_id, title, state, attempts, next_action, created_at, updated_at)
     VALUES ('IN-hidden', 'a title with no body', 'BODY_MISSING', 0, 'await official export',
             '2026-08-26T00:00:00Z', '2026-08-26T00:00:00Z')`,
  );
  s.db.exec('DROP VIEW v_mc_inbox');
  s.db.exec('CREATE VIEW v_mc_inbox AS SELECT *, 1 AS has_body FROM inbox_items WHERE 0 = 1');
  s.db.close();
  const run = runValidator(s.dbPath, s.migDir);
  record(
    'mission_control_inbox_panel_hides_items',
    run.status !== 0 && /FAIL mission_control_panels_recomputed/.test(run.stdout),
    run.stdout.match(/FAIL mission_control_panels_recomputed.*/)?.[0] ?? '',
  );
  rmSync(s.dir, { recursive: true, force: true });
}

// Case 26: the Approvals panel draws every grant as live, so an expired or
// revoked authority looks usable.
{
  const s = scaffold();
  s.db.exec('DROP VIEW v_mc_approvals');
  s.db.exec(
    `CREATE VIEW v_mc_approvals AS
     SELECT approval_id, exact_action, target, 'LIVE' AS state, uses, max_uses, max_cost_krw,
            expires_at, granted_by, owner_packet_ref, rollback_plan, created_at FROM approvals`,
  );
  setStop(s.db, false, 'seeded defect: approval panel', 'owner');
  s.db.exec(
    `INSERT INTO approvals (approval_id, scope_hash, exact_action, target, payload_hash, max_cost_krw,
       expires_at, max_uses, uses, rollback_plan, revoked, granted_by, created_at, owner_packet_ref)
     VALUES ('APR-seeded-stale', 'seededscope', 'seed.action', 'seed://target', 'seededpayload', 0,
       '2020-01-01T00:00:00.000Z', 1, 0, 'none', 0, 'owner', '2020-01-01T00:00:00.000Z',
       'evidence/OWNER-PACKET-002.md')`,
  );
  s.db.close();
  const run = runValidator(s.dbPath, s.migDir);
  record(
    'mission_control_shows_an_expired_approval_as_live',
    run.status !== 0 && /FAIL mission_control_panels_recomputed/.test(run.stdout),
    run.stdout.match(/FAIL mission_control_panels_recomputed.*/)?.[0] ?? '',
  );
  rmSync(s.dir, { recursive: true, force: true });
}

// Case 27: the Settings panel reports the emergency stop as released while it is
// engaged — the single most dangerous thing a panel can get wrong.
{
  const s = scaffold();
  s.db.exec('DROP VIEW v_mc_settings');
  s.db.exec(
    `CREATE VIEW v_mc_settings AS
     SELECT 0 AS emergency_stop_engaged, NULL AS emergency_stop_reason,
            (SELECT enabled FROM scheduler_state WHERE id = 1) AS scheduler_enabled,
            0 AS schedules_armed, 0 AS schedules,
            (SELECT max_active FROM portfolio_capacity WHERE id = 1) AS portfolio_max_active,
            (SELECT COUNT(*) FROM projects WHERE status IN ('BUILD','WATCH')) AS projects_active,
            (SELECT version FROM identity_kernel WHERE active = 1) AS identity_version,
            (SELECT version FROM release_state WHERE id = 1) AS release_version,
            (SELECT current_gate FROM release_state WHERE id = 1) AS current_gate,
            (SELECT COUNT(*) FROM schema_migrations) AS migrations_applied,
            (SELECT COUNT(*) FROM events) AS events,
            (SELECT hash FROM events ORDER BY seq DESC LIMIT 1) AS head_hash`,
  );
  s.db.close();
  const run = runValidator(s.dbPath, s.migDir);
  record(
    'mission_control_shows_the_stop_as_released_while_engaged',
    run.status !== 0 && /FAIL mission_control_panels_recomputed/.test(run.stdout),
    run.stdout.match(/FAIL mission_control_panels_recomputed.*/)?.[0] ?? '',
  );
  rmSync(s.dir, { recursive: true, force: true });
}

// Case 28: a panel view grows a column the pinned UI contract does not know
// about. A shell built against the pin would either ignore real state or draw a
// field nobody reviewed, so the drift has to fail rather than be absorbed.
{
  const s = scaffold();
  s.db.exec('DROP VIEW v_mc_inbox');
  s.db.exec(
    `CREATE VIEW v_mc_inbox AS
     SELECT inbox_id, title, state, 0 AS has_body, 0 AS attempts, 'guess' AS owner_mood FROM inbox_items`,
  );
  s.db.close();
  const run = runValidator(s.dbPath, s.migDir);
  record(
    'ui_contract_misses_a_new_panel_column',
    run.status !== 0 && /FAIL ui_contract_recomputed/.test(run.stdout),
    run.stdout.match(/FAIL ui_contract_recomputed.*/)?.[0] ?? '',
  );
  rmSync(s.dir, { recursive: true, force: true });
}

// Case 29: a panel the contract promises has no view at all. The shell would
// have to invent the panel's contents, which is the failure mode the read side
// exists to prevent.
{
  const s = scaffold();
  s.db.exec('DROP VIEW v_mc_costs');
  s.db.close();
  const run = runValidator(s.dbPath, s.migDir);
  record(
    'ui_contract_promises_a_panel_whose_view_is_gone',
    run.status !== 0 && /FAIL ui_contract_recomputed/.test(run.stdout),
    run.stdout.match(/FAIL ui_contract_recomputed.*/)?.[0] ?? '',
  );
  rmSync(s.dir, { recursive: true, force: true });
}

// G9 Evolution Lab. The triggers are the leash, so each case below removes one
// of them and does the thing it was there to stop. The point is that the
// independent validator re-derives the same refusal from the raw rows: if the
// schema is ever bypassed, the second opinion still catches the self-change.
const LAB_PATCH = 'the exact bytes of a proposed change';
const LAB_DIFF = createHash('sha256').update(Buffer.from(LAB_PATCH, 'utf8')).digest('hex');

/** A PROPOSED change to a legal target, with its bytes in the vault. */
function seedProposal(db, { target = 'src/ui/render.mjs', proposalId = 'PRP-seeded' } = {}) {
  db.prepare('INSERT OR IGNORE INTO blobs (sha256, size_bytes, bytes, created_at) VALUES (?, ?, ?, ?)').run(
    LAB_DIFF,
    LAB_PATCH.length,
    Buffer.from(LAB_PATCH, 'utf8'),
    '2026-08-26T00:00:00.000Z',
  );
  db.prepare(
    `INSERT INTO change_proposals (proposal_id, origin, target_path, diff_sha256, diff_bytes, patch_ref,
       rationale, risk, blast_radius, rollback_plan, created_by, created_at)
     VALUES (?, 'SELF', ?, ?, ?, ?, 'a seeded rationale', 'LOW', 'one module', 'revert', 'yeno',
             '2026-08-26T00:00:00.000Z')`,
  ).run(proposalId, target, LAB_DIFF, LAB_PATCH.length, `blob:${LAB_DIFF}`);
  return proposalId;
}

function seedBenchmark(db, proposalId, { verdict = 'PASS', baseline = 12, candidate = 3, id = 'BMK-seeded' } = {}) {
  db.prepare(
    `INSERT INTO proposal_benchmarks (benchmark_id, proposal_id, diff_sha256, suite, metric, baseline,
       candidate, higher_is_better, verdict, measured_by, evidence_ref, measured_at)
     VALUES (?, ?, ?, 'seeded', 'seeded_metric', ?, ?, 0, ?, 'seed', 'evidence/RUN-019.md',
             '2026-08-26T00:00:00.000Z')`,
  ).run(id, proposalId, LAB_DIFF, baseline, candidate, verdict);
}

// Case 30: a self-change reaches APPROVED with nobody's consent attached.
{
  const s = scaffold();
  const id = seedProposal(s.db);
  seedBenchmark(s.db, id);
  s.db.exec('DROP TRIGGER trg_proposal_state_ladder');
  s.db.exec('DROP TRIGGER trg_proposal_approved_needs_owner_approval');
  s.db.prepare('UPDATE change_proposals SET state = ? WHERE proposal_id = ?').run('APPROVED', id);
  s.db.close();
  const run = runValidator(s.dbPath, s.migDir);
  record(
    'evolution_proposal_is_approved_without_owner_consent',
    run.status !== 0 && /FAIL evolution_lab_recomputed/.test(run.stdout),
    run.stdout.match(/FAIL evolution_lab_recomputed.*/)?.[0] ?? '',
  );
  rmSync(s.dir, { recursive: true, force: true });
}

// Case 31: a benchmark claims the change improved things while its own numbers
// got worse — self-measurement is worthless if the verdict can disagree with it.
{
  const s = scaffold();
  const id = seedProposal(s.db);
  s.db.exec('DROP TRIGGER trg_benchmark_verdict_matches_numbers');
  seedBenchmark(s.db, id, { verdict: 'PASS', baseline: 12, candidate: 40 });
  s.db.close();
  const run = runValidator(s.dbPath, s.migDir);
  record(
    'evolution_benchmark_claims_pass_on_worse_numbers',
    run.status !== 0 && /FAIL evolution_lab_recomputed/.test(run.stdout),
    run.stdout.match(/FAIL evolution_lab_recomputed.*/)?.[0] ?? '',
  );
  rmSync(s.dir, { recursive: true, force: true });
}

// Case 32: a proposal aimed at the safety layer itself — the validator that
// judges it. This is the one self-change that must never exist in the ledger.
{
  const s = scaffold();
  s.db.exec('DROP TRIGGER trg_proposal_target_not_forbidden');
  seedProposal(s.db, { target: 'scripts/independent-validation.mjs', proposalId: 'PRP-seeded-leash' });
  s.db.close();
  const run = runValidator(s.dbPath, s.migDir);
  record(
    'evolution_proposal_targets_its_own_judge',
    run.status !== 0 && /FAIL evolution_lab_recomputed/.test(run.stdout),
    run.stdout.match(/FAIL evolution_lab_recomputed.*/)?.[0] ?? '',
  );
  rmSync(s.dir, { recursive: true, force: true });
}

const missed = results.filter((r) => !r.detected);
process.stdout.write(`\nseeded defects: ${results.length}, detected: ${results.length - missed.length}, missed: ${missed.length}\n`);
if (missed.length > 0) {
  process.stdout.write(`SEEDED_DEFECT_CHECK_FAIL: ${missed.map((m) => m.name).join(', ')}\n`);
  process.exit(1);
}
process.stdout.write('SEEDED_DEFECT_CHECK_PASS\n');
