#!/usr/bin/env node
// Records the G0 baseline into the kernel itself: a work order, ledger events,
// a gate transition and an evidence bundle on disk. Refuses to run unless the
// latest local CI manifest is green, so the baseline can never claim more than
// the machine checks proved.
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { openDb } from '../src/core/db.mjs';
import { migrate, appliedMigrations } from '../src/core/migrate.mjs';
import { appendEvent, head } from '../src/core/events.mjs';
import { verifyReport } from '../src/domain/status.mjs';
import { sha256, sha256Json } from '../src/core/hash.mjs';

const REPO = new URL('..', import.meta.url).pathname;
const BASELINE_ID = 'BASELINE-20260826';
const EVIDENCE_DIR = join(REPO, 'evidence');
const manifestPath = join(EVIDENCE_DIR, 'local-ci-latest.json');

if (!existsSync(manifestPath)) {
  process.stderr.write('REFUSED: no evidence/local-ci-latest.json. Run `node scripts/local-ci.mjs` first.\n');
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (!manifest.ok) {
  process.stderr.write(`REFUSED: latest local CI manifest is not green (${manifest.steps_failed} failed step(s)).\n`);
  process.exit(1);
}

function shell(command, fallback = 'UNAVAILABLE') {
  try {
    return execFileSync('bash', ['-lc', command], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return fallback;
  }
}

const env = {
  node: process.version,
  platform: `${process.platform}-${process.arch}`,
  os_release: shell('uname -srm'),
  wsl: process.env.WSL_DISTRO_NAME ?? (existsSync('/proc/sys/fs/binfmt_misc/WSLInterop') ? 'wsl-detected' : 'not-wsl'),
  memory_total_mb: Number((shell("free -m | awk '/Mem:/ {print $2}'") || '0').replace(/\D/g, '')) || null,
  memory_available_mb: Number((shell("free -m | awk '/Mem:/ {print $7}'") || '0').replace(/\D/g, '')) || null,
  disk_avail_home: shell("df -h /home | awk 'NR==2 {print $4}'"),
  git_head: shell(`git -C ${REPO} rev-parse --verify --quiet HEAD`, 'NO_COMMITS_YET') || 'NO_COMMITS_YET',
  git_branch: shell(`git -C ${REPO} symbolic-ref --short HEAD`),
  git_status_lines: Number(shell(`git -C ${REPO} status --porcelain | wc -l`)) || 0,
};

const dbPath = join(REPO, 'state', 'yeno.db');
mkdirSync(join(REPO, 'state'), { recursive: true });
const db = openDb(dbPath);
migrate(db);

const verification = verifyReport(db);
if (!verification.ok) {
  process.stderr.write(`REFUSED: kernel verify is failing:\n${JSON.stringify(verification.failed, null, 2)}\n`);
  db.close();
  process.exit(1);
}

const migrations = appliedMigrations(db).map((m) => ({
  filename: m.filename,
  checksum: m.checksum,
  applied_at: m.applied_at,
}));

const sourceInventory = manifest.source_inventory ?? [];
const inventoryHash = sha256Json(sourceInventory);

// The frozen master documents named in the contract were never available in
// this environment, so the baseline records their absence instead of inventing
// hashes for them.
const frozenSources = [
  'YENO_LIVING_OS_UNBOUNDED_REASSEMBLY_MASTER_v5.0_KO.md',
  'YENO_OS_ALL_IN_ONE_COMPLETE_MASTER_v1.0_20260826_KO.md',
  'YENO_LIVING_OS_ENGINEERING_EXECUTION_MASTER_v6.0_20260826_KO.md',
  'YENO_OS_ACTUAL_BUILD_BLUEPRINT_v1.0_20260826_KO.md',
  'YENO_144_TITLE_RECOVERY_LEDGER_v1.0_20260826_KO.md',
].map((name) => {
  const candidate = join(REPO, '..', name);
  return existsSync(candidate)
    ? { name, status: 'PRESENT', size: statSync(candidate).size, sha256: sha256(readFileSync(candidate)) }
    : { name, status: 'NEEDS_SOURCE' };
});

const now = new Date().toISOString();
const baseline = {
  baseline_id: BASELINE_ID,
  recorded_at: now,
  kind: 'FRESH_BUILD',
  note:
    'No prior yeno-os-next kernel, state/yeno.db or frozen master document existed in this environment. ' +
    'This baseline locks a newly built kernel; it does not reproduce any earlier snapshot numbers.',
  environment: env,
  migrations,
  event_ledger: { count: head(db).seq, head_hash: head(db).hash },
  verify: { ok: verification.ok, checks: verification.checks.length, failed: verification.failed },
  local_ci: {
    manifest: relative(REPO, manifestPath),
    started_at: manifest.started_at,
    steps_total: manifest.steps_total,
    steps_failed: manifest.steps_failed,
    steps: manifest.steps.map((s) => ({ id: s.id, exit_code: s.exit_code, stdout_sha256: s.stdout_sha256 })),
  },
  source_inventory_hash: inventoryHash,
  source_inventory_files: sourceInventory.length,
  frozen_master_sources: frozenSources,
  incomplete: [
    { id: 'G2', marker: 'NEEDS_SOURCE', detail: 'no official chat export ingested; 144-title recovery cannot be verified' },
    { id: 'G5', marker: 'BLOCKED', detail: 'no provider auth wired; agent team stays disabled' },
    { id: 'G10', marker: 'INCOMPLETE', detail: 'no Windows body, tray, scheduler, voice or 72h soak evidence' },
    { id: 'OWNER_GATE', marker: 'BLOCKED', detail: 'commit/push/PR withheld pending Owner approval' },
  ],
};

const baselineHash = sha256Json(baseline);
const bundle = { ...baseline, baseline_hash: baselineHash };

mkdirSync(EVIDENCE_DIR, { recursive: true });
const jsonPath = join(EVIDENCE_DIR, `${BASELINE_ID}.json`);
writeFileSync(jsonPath, `${JSON.stringify(bundle, null, 2)}\n`);

const md = `# ${BASELINE_ID}

- recorded_at: ${now}
- kind: FRESH_BUILD (no prior kernel existed in this environment)
- baseline_hash: \`${baselineHash}\`
- node: ${env.node} / ${env.platform} / ${env.os_release}
- wsl: ${env.wsl}
- ram: ${env.memory_available_mb ?? '?'} MB available of ${env.memory_total_mb ?? '?'} MB
- disk (/home): ${env.disk_avail_home} available
- git: branch ${env.git_branch}, head ${env.git_head}, ${env.git_status_lines} uncommitted path(s)

## Applied migrations
${migrations.map((m) => `- ${m.filename} \`${m.checksum}\` applied ${m.applied_at}`).join('\n')}

## Event ledger (state before the baseline events were appended)
- events: ${bundle.event_ledger.count}
- head hash: \`${bundle.event_ledger.head_hash}\`

## Machine checks (local CI ${manifest.started_at})
${manifest.steps.map((s) => `- ${s.ok ? 'PASS' : 'FAIL'} ${s.id} (exit ${s.exit_code})`).join('\n')}

## Kernel verify
- ${verification.checks.length} checks, ${verification.failed.length} failed

## Frozen master sources
${frozenSources.map((s) => `- ${s.status} ${s.name}${s.sha256 ? ` \`${s.sha256}\`` : ''}`).join('\n')}

## Still incomplete
${bundle.incomplete.map((i) => `- ${i.marker} ${i.id}: ${i.detail}`).join('\n')}
`;
const mdPath = join(EVIDENCE_DIR, `${BASELINE_ID}.md`);
writeFileSync(mdPath, md);

const evidenceRef = `evidence/${BASELINE_ID}.json#${baselineHash.slice(0, 16)}`;

db.exec('BEGIN IMMEDIATE');
try {
  const existing = db.prepare("SELECT wo_id FROM work_orders WHERE wo_id = 'WO-G0-001'").get();
  if (!existing) {
    db.prepare(
      `INSERT INTO work_orders (wo_id, gate_id, goal, source_refs, baseline_ref, allowed_paths, denied_paths,
         authority, network, cost_p90_krw, deadline, acceptance, evidence_ref, rollback, state, created_at)
       VALUES ('WO-G0-001','G0','Build and lock a fresh local Truth Kernel baseline',?,?,?,?,'A2','NONE',0,NULL,?,NULL,?, 'OPEN', ?)`,
    ).run(
      JSON.stringify(['CLAUDE.md work contract']),
      BASELINE_ID,
      JSON.stringify(['migrations/', 'src/', 'scripts/', 'test/', '.claude/']),
      JSON.stringify(['.env', '.git/']),
      'local CI green, independent validation pass, seeded defects all detected',
      'delete state/ and evidence/, re-run local CI',
      now,
    );
  }
  db.prepare('UPDATE work_orders SET evidence_ref = ?, state = ?, closed_at = ? WHERE wo_id = ?').run(
    evidenceRef,
    'CLOSED_PASS',
    now,
    'WO-G0-001',
  );

  appendEvent(db, {
    eventId: `EVT-${BASELINE_ID}-recorded`,
    type: 'baseline.recorded',
    actor: 'scripts/record-baseline.mjs',
    authority: 'A2',
    payload: {
      baseline_id: BASELINE_ID,
      baseline_hash: baselineHash,
      migrations: migrations.map((m) => m.checksum),
      source_inventory_hash: inventoryHash,
      local_ci_started_at: manifest.started_at,
    },
  });
  appendEvent(db, {
    eventId: `EVT-${BASELINE_ID}-gate-G0`,
    type: 'gate.state_changed',
    actor: 'scripts/record-baseline.mjs',
    authority: 'A2',
    payload: { gate_id: 'G0', from: 'IN_PROGRESS', to: 'PASSED', evidence_ref: evidenceRef },
  });

  db.prepare('UPDATE gates SET state = ?, evidence_ref = ?, updated_at = ? WHERE gate_id = ?').run(
    'PASSED',
    evidenceRef,
    now,
    'G0',
  );
  db.prepare('UPDATE gates SET state = ?, updated_at = ? WHERE gate_id = ? AND state = ?').run(
    'IN_PROGRESS',
    now,
    'G1',
    'PENDING',
  );
  db.prepare('UPDATE release_state SET current_gate = ?, updated_at = ?, evidence_ref = ? WHERE id = 1').run(
    'G1',
    now,
    evidenceRef,
  );
  db.exec('COMMIT');
} catch (err) {
  db.exec('ROLLBACK');
  db.close();
  throw err;
}

const finalHead = head(db);
db.close();

process.stdout.write(`${BASELINE_ID} recorded\n`);
process.stdout.write(`  baseline_hash: ${baselineHash}\n`);
process.stdout.write(`  evidence:      ${relative(REPO, mdPath)}, ${relative(REPO, jsonPath)}\n`);
process.stdout.write(`  ledger head:   seq ${finalHead.seq} ${finalHead.hash}\n`);
process.stdout.write('  gate:          G0 PASSED, G1 IN_PROGRESS\n');
