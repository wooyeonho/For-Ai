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

if (!existsSync(dbPath)) {
  process.stderr.write(`INDEPENDENT_VALIDATION: no database at ${dbPath}\n`);
  process.exit(2);
}

const db = new DatabaseSync(dbPath, { readOnly: true });

// 1. SQLite's own integrity opinion.
const integrity = db.prepare('PRAGMA integrity_check').all().map((r) => Object.values(r)[0]).join('; ');
integrity === 'ok' ? pass('sqlite_integrity') : fail('sqlite_integrity', integrity);

// 2. Migration checksums recomputed from the files on disk.
const applied = db.prepare('SELECT filename, checksum, applied_order FROM schema_migrations ORDER BY applied_order').all();
const diskFiles = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
for (const row of applied) {
  if (!diskFiles.includes(row.filename)) {
    fail('migration_file_present', `${row.filename} missing on disk`);
    continue;
  }
  const recomputed = digest(readFileSync(join(migrationsDir, row.filename), 'utf8'));
  recomputed === row.checksum
    ? pass('migration_checksum', row.filename)
    : fail('migration_checksum', `${row.filename} db=${row.checksum} disk=${recomputed}`);
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
inboxMismatch.length === 0
  ? pass('projection_matches_ledger', `${expectedInbox.size} inbox rows`)
  : fail('projection_matches_ledger', inboxMismatch.join(' | '));

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
vaultProblems.length === 0
  ? pass('vault_bytes_rehashed', `${vaultRows.length} source versions`)
  : fail('vault_bytes_rehashed', vaultProblems.join(' | '));

db.close();

const failed = findings.filter((f) => !f.ok);
const report = { db: dbPath, ok: failed.length === 0, checks: findings.length, failed };
if (asJson) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
else {
  for (const f of findings) process.stdout.write(`${f.ok ? 'PASS' : 'FAIL'} ${f.check}${f.detail ? ` — ${f.detail}` : ''}\n`);
  process.stdout.write(`${report.ok ? 'INDEPENDENT_VALIDATION_PASS' : 'INDEPENDENT_VALIDATION_FAIL'}\n`);
}
process.exit(report.ok ? 0 : 1);
