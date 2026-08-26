#!/usr/bin/env node
// Repeatable local CI. Runs every machine check the contract requires, in a
// fixed order, and writes a manifest so a run can be replayed and compared.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const REPO = new URL('..', import.meta.url).pathname;
const EVIDENCE_DIR = join(REPO, 'evidence');

const STEPS = [
  { id: 'node_version', argv: ['--version'] },
  { id: 'unit_and_adversarial_tests', argv: ['--test', '--test-reporter=spec'] },
  { id: 'migration_checksum_pin', argv: ['scripts/pin-migration-checksums.mjs', '--check'] },
  { id: 'cli_migrate', argv: ['src/cli.mjs', 'migrate'] },
  { id: 'cli_status', argv: ['src/cli.mjs', 'status', '--json'] },
  { id: 'cli_verify', argv: ['src/cli.mjs', 'verify', '--json'] },
  { id: 'event_replay', argv: ['src/cli.mjs', 'event', 'replay', '--json'] },
  { id: 'projection_rebuild', argv: ['src/cli.mjs', 'projection', 'rebuild'] },
  {
    id: 'durability_soak',
    argv: ['scripts/soak.mjs', '--cycles', '2', '--batch', '8', '--evidence-dir', 'evidence/runtime'],
  },
  { id: 'queue_crash_soak', argv: ['scripts/queue-soak.mjs', '--cycles', '4'] },
  // `--no-record` keeps repeated CI runs out of the kernel's soak evidence: the
  // recorded soaks are the deliberate ones a RUN's evidence cites.
  { id: 'scheduler_crash_soak', argv: ['scripts/scheduler-soak.mjs', '--cycles', '4', '--no-record'] },
  { id: 'scheduler_daemon_restart_soak', argv: ['scripts/daemon-soak.mjs', '--cycles', '4', '--no-record'] },
  { id: 'scheduler_supervisor_soak', argv: ['scripts/supervisor-soak.mjs', '--cycles', '3', '--no-record'] },
  { id: 'independent_validation', argv: ['scripts/independent-validation.mjs'] },
  { id: 'self_adversarial_probes', argv: ['scripts/self-adversarial-probes.mjs'] },
  { id: 'governor_red_team', argv: ['scripts/red-team-governor.mjs', '--no-record'] },
  { id: 'queue_red_team', argv: ['scripts/red-team-queue.mjs', '--no-record'] },
  { id: 'seeded_defect_detection', argv: ['scripts/assert-seeded-defect-detected.mjs'] },
];

function sourceInventory() {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', '.git', 'state', 'backups', 'evidence'].includes(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(mjs|sql|json|md)$/.test(entry.name)) files.push(full);
    }
  };
  walk(REPO);
  files.sort();
  return files.map((full) => ({
    path: relative(REPO, full),
    size: statSync(full).size,
    sha256: createHash('sha256').update(readFileSync(full)).digest('hex'),
  }));
}

const startedAt = new Date().toISOString();
const results = [];
let failed = 0;

for (const step of STEPS) {
  const begin = Date.now();
  const run = spawnSync(process.execPath, step.argv, { cwd: REPO, encoding: 'utf8' });
  const ok = run.status === 0;
  if (!ok) failed += 1;
  const stdout = run.stdout ?? '';
  const stderr = run.stderr ?? '';
  results.push({
    id: step.id,
    argv: step.argv,
    exit_code: run.status,
    ok,
    duration_ms: Date.now() - begin,
    stdout_sha256: createHash('sha256').update(stdout).digest('hex'),
    stdout_tail: stdout.trimEnd().split('\n').slice(-12).join('\n'),
    stderr_tail: stderr.trimEnd().split('\n').slice(-12).join('\n'),
  });
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'} ${step.id} (exit ${run.status})\n`);
}

const manifest = {
  manifest_version: 1,
  started_at: startedAt,
  finished_at: new Date().toISOString(),
  node_version: process.version,
  platform: `${process.platform}-${process.arch}`,
  ok: failed === 0,
  steps_total: results.length,
  steps_failed: failed,
  steps: results,
  source_inventory: sourceInventory(),
};

mkdirSync(EVIDENCE_DIR, { recursive: true });
const stamp = startedAt.replace(/[:.]/g, '-');
const manifestPath = join(EVIDENCE_DIR, `local-ci-${stamp}.json`);
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(join(EVIDENCE_DIR, 'local-ci-latest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

process.stdout.write(`\nmanifest: ${relative(REPO, manifestPath)}\n`);
process.stdout.write(`${failed === 0 ? 'LOCAL_CI_PASS' : `LOCAL_CI_FAIL (${failed} step(s))`}\n`);
process.exit(failed === 0 ? 0 : 1);
