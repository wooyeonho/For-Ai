import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { finishSoak, noteCycle, recordProbe, REQUIRED_PROBE_KINDS, soakReport, startSoak, durabilityEvidence } from '../src/domain/soak.mjs';
import { verifyReport } from '../src/domain/status.mjs';
import { freshDb, tempDir, MIGRATIONS } from './helpers.mjs';

const REPO = new URL('..', import.meta.url).pathname;

function fullyProbe(db, soakId, cycles, { failKind = null } = {}) {
  for (let cycle = 1; cycle <= cycles; cycle += 1) {
    for (const kind of REQUIRED_PROBE_KINDS) {
      recordProbe(db, soakId, {
        cycle,
        kind,
        ok: kind !== failKind,
        detail: kind === failKind ? 'seeded failure' : 'ok',
        durationMs: 1,
      });
    }
    noteCycle(db, soakId, { kills: 1, restores: 1, events: 10 });
  }
}

test('G1 starts out honest: no soak session, no durability evidence', () => {
  const { db, cleanup } = freshDb();
  try {
    assert.equal(durabilityEvidence(db), null);
    const g1 = db.prepare("SELECT state, blocked_reason FROM gates WHERE gate_id = 'G1'").get();
    assert.notEqual(g1.state, 'PASSED');
    assert.match(g1.blocked_reason, /NEEDS_SOAK/);
    assert.equal(verifyReport(db, { migrationsDir: MIGRATIONS }).ok, true);
  } finally {
    cleanup();
  }
});

test('a complete soak session passes and becomes the G1 durability evidence', () => {
  const { db, cleanup } = freshDb();
  try {
    const soakId = startSoak(db, { plannedCycles: 3 });
    fullyProbe(db, soakId, 3);
    const outcome = finishSoak(db, soakId, { headHash: 'a'.repeat(64), evidenceRef: 'evidence/SOAK-test.json' });
    assert.equal(outcome.state, 'PASSED', outcome.reasons.join('; '));

    const evidence = durabilityEvidence(db);
    assert.equal(evidence.soak_id, soakId);
    assert.equal(evidence.completed_cycles, 3);
    assert.equal(evidence.probes, 18);
    assert.equal(evidence.probes_failed, 0);

    const report = soakReport(db, soakId);
    assert.equal(report.passed_sessions, 1);
    assert.deepEqual(
      report.sessions[0].probes_by_kind.map((p) => p.kind),
      [...REQUIRED_PROBE_KINDS].sort(),
    );
  } finally {
    cleanup();
  }
});

test('one failing probe fails the whole soak, and the failure is kept', () => {
  const { db, cleanup } = freshDb();
  try {
    const soakId = startSoak(db, { plannedCycles: 2 });
    fullyProbe(db, soakId, 2, { failKind: 'BACKUP_RESTORE' });
    const outcome = finishSoak(db, soakId, { headHash: 'b'.repeat(64), evidenceRef: 'evidence/SOAK-test.json' });
    assert.equal(outcome.state, 'FAILED');
    assert.match(outcome.reasons.join('; '), /probes failed/);
    assert.equal(durabilityEvidence(db), null);

    const failures = soakReport(db, soakId).sessions[0].failures;
    assert.equal(failures.length, 2);
    assert.equal(failures[0].kind, 'BACKUP_RESTORE');
  } finally {
    cleanup();
  }
});

test('a soak without a SIGKILL, without a restore, or short of its plan cannot pass', () => {
  const { db, cleanup } = freshDb();
  try {
    const noKill = startSoak(db, { plannedCycles: 1 });
    for (const kind of REQUIRED_PROBE_KINDS) recordProbe(db, noKill, { cycle: 1, kind, ok: true, detail: 'ok' });
    noteCycle(db, noKill, { kills: 0, restores: 1, events: 1 });
    assert.match(finishSoak(db, noKill, { evidenceRef: 'e' }).reasons.join('; '), /no process was SIGKILLed/);

    const noRestore = startSoak(db, { plannedCycles: 1 });
    for (const kind of REQUIRED_PROBE_KINDS) recordProbe(db, noRestore, { cycle: 1, kind, ok: true, detail: 'ok' });
    noteCycle(db, noRestore, { kills: 1, restores: 0, events: 1 });
    assert.match(finishSoak(db, noRestore, { evidenceRef: 'e' }).reasons.join('; '), /no backup was restored/);

    const short = startSoak(db, { plannedCycles: 5 });
    fullyProbe(db, short, 2);
    assert.match(finishSoak(db, short, { evidenceRef: 'e' }).reasons.join('; '), /2\/5 cycles/);

    const partial = startSoak(db, { plannedCycles: 1 });
    for (const kind of REQUIRED_PROBE_KINDS.filter((k) => k !== 'LEASE_FENCING')) {
      recordProbe(db, partial, { cycle: 1, kind, ok: true, detail: 'ok' });
    }
    noteCycle(db, partial, { kills: 1, restores: 1, events: 1 });
    assert.match(finishSoak(db, partial, { evidenceRef: 'e' }).reasons.join('; '), /LEASE_FENCING/);

    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM soak_sessions WHERE state = 'PASSED'").get().n, 0);
  } finally {
    cleanup();
  }
});

test('probing one cycle heavily does not stand in for probing every cycle', () => {
  const { db, cleanup } = freshDb();
  try {
    const soakId = startSoak(db, { plannedCycles: 3 });
    fullyProbe(db, soakId, 1);
    // Cycles 2 and 3 ran but only recorded part of the probe set.
    for (const cycle of [2, 3]) {
      recordProbe(db, soakId, { cycle, kind: 'CHAIN_VERIFY', ok: true, detail: 'ok' });
      noteCycle(db, soakId, { kills: 1, restores: 1, events: 10 });
    }
    const outcome = finishSoak(db, soakId, { headHash: 'd'.repeat(64), evidenceRef: 'e' });
    assert.equal(outcome.state, 'FAILED');
    assert.match(outcome.reasons.join('; '), /incomplete probe set: 2, 3/);
    assert.equal(durabilityEvidence(db), null);
  } finally {
    cleanup();
  }
});

test('the schema refuses a hand-written PASSED soak even when the domain layer is bypassed', () => {
  const { db, cleanup } = freshDb();
  try {
    const soakId = startSoak(db, { plannedCycles: 4 });
    fullyProbe(db, soakId, 1);
    assert.throws(
      () => db.prepare("UPDATE soak_sessions SET state = 'PASSED', evidence_ref = 'e' WHERE soak_id = ?").run(soakId),
      /YENO_SAFETY: a soak session cannot pass without complete per-cycle crash\/restore probe evidence/,
    );

    // Nor by inflating the counters while probes are still missing.
    assert.throws(
      () =>
        db
          .prepare(
            `UPDATE soak_sessions SET state = 'PASSED', completed_cycles = 4, kill_count = 4,
                restore_count = 4, evidence_ref = 'e' WHERE soak_id = ?`,
          )
          .run(soakId),
      /YENO_SAFETY/,
    );
  } finally {
    cleanup();
  }
});

test('probe results are append-only evidence', () => {
  const { db, cleanup } = freshDb();
  try {
    const soakId = startSoak(db, { plannedCycles: 1 });
    const probeId = recordProbe(db, soakId, { cycle: 1, kind: 'INTEGRITY', ok: false, detail: 'corrupt page' });
    assert.throws(() => db.prepare('DELETE FROM durability_probes WHERE probe_id = ?').run(probeId), /append-only/);
    assert.throws(
      () => db.prepare('UPDATE durability_probes SET ok = 1 WHERE probe_id = ?').run(probeId),
      /cannot be rewritten/,
    );
    assert.throws(
      () => recordProbe(db, soakId, { cycle: 1, kind: 'INTEGRITY', ok: true, detail: 'second opinion' }),
      /UNIQUE|constraint/,
    );
  } finally {
    cleanup();
  }
});

test('G1 cannot be marked PASSED while no soak session has passed', () => {
  const { db, cleanup } = freshDb();
  try {
    assert.throws(
      () =>
        db
          .prepare("UPDATE gates SET state = 'PASSED', evidence_ref = 'evidence/BASELINE-20260826.md' WHERE gate_id = 'G1'")
          .run(),
      /YENO_SAFETY: G1 needs a passing soak with at least 100 crash\/restore cycles/,
    );

    // Second line of defence: even with the trigger gone, verify still refuses
    // to believe a G1 promotion that no soak session supports.
    db.exec('DROP TRIGGER trg_g1_pass_needs_soak');
    db.exec('DROP TRIGGER trg_gate_pass_in_order');
    db.prepare("UPDATE gates SET state = 'PASSED', evidence_ref = 'evidence/BASELINE-20260826.md' WHERE gate_id = 'G1'").run();
    const report = verifyReport(db, { migrationsDir: MIGRATIONS });
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('g1_not_passed_without_soak'), report.failed.join(','));

    const soakId = startSoak(db, { plannedCycles: 1 });
    fullyProbe(db, soakId, 1);
    finishSoak(db, soakId, { headHash: 'c'.repeat(64), evidenceRef: 'evidence/SOAK-test.json' });
    assert.equal(verifyReport(db, { migrationsDir: MIGRATIONS }).ok, true);
  } finally {
    cleanup();
  }
});

test('the soak runner really SIGKILLs a writer and restores a backup', () => {
  const dir = tempDir();
  const dbPath = join(dir, 'yeno.db');
  const run = spawnSync(
    process.execPath,
    // Test soaks write throwaway evidence; only real gate soaks belong in evidence/.
    [join(REPO, 'scripts', 'soak.mjs'), '--cycles', '2', '--batch', '4', '--db', dbPath, '--evidence-dir', 'evidence/runtime'],
    { cwd: REPO, encoding: 'utf8' },
  );
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  assert.match(run.stdout, /SOAK_PASS/);

  const soakId = run.stdout.match(/SOAK_PASS (\S+)/)[1];
  const evidence = JSON.parse(readFileSync(join(REPO, 'evidence', 'runtime', `${soakId}.json`), 'utf8'));
  assert.equal(evidence.outcome.state, 'PASSED');

  const session = evidence.report.sessions[0];
  assert.equal(session.completed_cycles, 2);
  assert.equal(session.kill_count, 2);
  assert.equal(session.restore_count, 2);
  assert.equal(session.probes_failed, 0);
  assert.equal(session.probe_kinds, REQUIRED_PROBE_KINDS.length);
  assert.match(
    session.probes_by_kind.find((p) => p.kind === 'CRASH_REPLAY').runs.toString(),
    /^2$/,
  );
});
