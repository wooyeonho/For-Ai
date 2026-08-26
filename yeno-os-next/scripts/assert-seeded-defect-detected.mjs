#!/usr/bin/env node
// Seeded-defect harness: proves the validators actually detect damage instead
// of printing green. Each case builds a throwaway kernel, injects one specific
// defect, and requires the matching validator to fail.
import { mkdtempSync, rmSync, copyFileSync, writeFileSync, readFileSync, mkdirSync, readdirSync, openSync, writeSync, closeSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { openDb } from '../src/core/db.mjs';
import { migrate } from '../src/core/migrate.mjs';
import { appendEvent } from '../src/core/events.mjs';
import { catchUp } from '../src/core/projections.mjs';
import { createBackup, verifyBackup } from '../src/core/backup.mjs';

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

// Case 10: a corrupted backup file must be refused by backup verify.
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

const missed = results.filter((r) => !r.detected);
process.stdout.write(`\nseeded defects: ${results.length}, detected: ${results.length - missed.length}, missed: ${missed.length}\n`);
if (missed.length > 0) {
  process.stdout.write(`SEEDED_DEFECT_CHECK_FAIL: ${missed.map((m) => m.name).join(', ')}\n`);
  process.exit(1);
}
process.stdout.write('SEEDED_DEFECT_CHECK_PASS\n');
