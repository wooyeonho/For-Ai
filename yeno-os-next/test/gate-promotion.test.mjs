import { test } from 'node:test';
import assert from 'node:assert/strict';
import { G1_MIN_CYCLES, gateReport, passGate, promotionBlockers } from '../src/domain/gate.mjs';
import { finishSoak, noteCycle, recordProbe, REQUIRED_PROBE_KINDS, startSoak } from '../src/domain/soak.mjs';
import { freshDb, MIGRATIONS } from './helpers.mjs';

/** A soak long enough to satisfy the G1 floor, recorded probe by probe. */
function qualifyingSoak(db, cycles = G1_MIN_CYCLES) {
  const soakId = startSoak(db, { plannedCycles: cycles });
  for (let cycle = 1; cycle <= cycles; cycle += 1) {
    for (const kind of REQUIRED_PROBE_KINDS) {
      recordProbe(db, soakId, { cycle, kind, ok: true, detail: 'ok', durationMs: 1 });
    }
    noteCycle(db, soakId, { kills: 1, restores: 1, events: 10 });
  }
  // The committed acceptance evidence file of the real 300-cycle run.
  finishSoak(db, soakId, {
    headHash: 'a'.repeat(64),
    evidenceRef: 'evidence/SOAK-cf77e410-d146-4b9f-b0d3-26bffaef8cb8.json',
  });
  return soakId;
}

test('a gate cannot be promoted with an evidence reference that does not exist', () => {
  const { db, cleanup } = freshDb();
  try {
    const outcome = passGate(db, 'G0', { evidenceRef: 'evidence/DOES-NOT-EXIST.md', migrationsDir: MIGRATIONS });
    assert.equal(outcome.promoted, false);
    assert.match(outcome.reasons.join('; '), /does not exist in the repository/);
    assert.notEqual(db.prepare("SELECT state FROM gates WHERE gate_id = 'G0'").get().state, 'PASSED');
  } finally {
    cleanup();
  }
});

test('G1 refuses promotion until a long enough real soak exists', () => {
  const { db, cleanup } = freshDb();
  try {
    passGate(db, 'G0', { evidenceRef: 'evidence/BASELINE-20260826.md', migrationsDir: MIGRATIONS });

    const short = startSoak(db, { plannedCycles: 2 });
    for (let cycle = 1; cycle <= 2; cycle += 1) {
      for (const kind of REQUIRED_PROBE_KINDS) recordProbe(db, short, { cycle, kind, ok: true, detail: 'ok' });
      noteCycle(db, short, { kills: 1, restores: 1, events: 4 });
    }
    finishSoak(db, short, { headHash: 'b'.repeat(64), evidenceRef: 'evidence/BASELINE-20260826.md' });

    const refused = passGate(db, 'G1', { evidenceRef: 'evidence/BASELINE-20260826.md', migrationsDir: MIGRATIONS });
    assert.equal(refused.promoted, false);
    assert.match(refused.reasons.join('; '), new RegExp(`below the ${G1_MIN_CYCLES}-cycle floor`));

    qualifyingSoak(db);
    const passed = passGate(db, 'G1', {
      evidenceRef: 'evidence/SOAK-cf77e410-d146-4b9f-b0d3-26bffaef8cb8.json',
      migrationsDir: MIGRATIONS,
    });
    assert.equal(passed.promoted, true, passed.reasons.join('; '));
    assert.equal(db.prepare("SELECT state FROM gates WHERE gate_id = 'G1'").get().state, 'PASSED');
  } finally {
    cleanup();
  }
});

test('gates pass in release-train order, and the schema says so too', () => {
  const { db, cleanup } = freshDb();
  try {
    const outcome = passGate(db, 'G4', { evidenceRef: 'evidence/BASELINE-20260826.md', migrationsDir: MIGRATIONS });
    assert.equal(outcome.promoted, false);
    assert.match(outcome.reasons.join('; '), /earlier gates not passed/);

    assert.throws(
      () =>
        db
          .prepare("UPDATE gates SET state = 'PASSED', evidence_ref = 'evidence/BASELINE-20260826.md' WHERE gate_id = 'G4'")
          .run(),
      /YENO_SAFETY: an earlier gate has not passed yet/,
    );
    assert.throws(
      () => db.prepare("UPDATE gates SET state = 'PASSED', evidence_ref = NULL WHERE gate_id = 'G0'").run(),
      /YENO_SAFETY: gate PASSED requires evidence_ref/,
    );
  } finally {
    cleanup();
  }
});

test('G5 stays provider-blocked and G6 stays PREP_ONLY without a live RUN', () => {
  const { db, cleanup } = freshDb();
  try {
    passGate(db, 'G0', { evidenceRef: 'evidence/BASELINE-20260826.md', migrationsDir: MIGRATIONS });
    qualifyingSoak(db);
    passGate(db, 'G1', {
      evidenceRef: 'evidence/SOAK-cf77e410-d146-4b9f-b0d3-26bffaef8cb8.json',
      migrationsDir: MIGRATIONS,
    });

    assert.match(promotionBlockers(db, 'G5', { evidenceRef: 'evidence/RUN-003.md' }).join('; '), /BLOCKED_PROVIDER_ACCESS/);
    assert.match(promotionBlockers(db, 'G6', { evidenceRef: 'evidence/RUN-003.md' }).join('; '), /PREP_ONLY/);

    // Even bypassing the domain layer entirely, G6 cannot outrun G5.
    assert.throws(
      () => db.prepare("UPDATE gates SET state = 'PASSED', evidence_ref = 'evidence/RUN-003.md' WHERE gate_id = 'G6'").run(),
      /YENO_SAFETY/,
    );
  } finally {
    cleanup();
  }
});

test('the gate report tells the truth about missing evidence files', () => {
  const { db, cleanup } = freshDb();
  try {
    const report = gateReport(db);
    assert.equal(report.gates.length, 15);
    assert.equal(report.gates.every((g) => g.state === 'PASSED' ? g.evidence_present : true), true);
    assert.equal(report.gates.filter((g) => g.state === 'PASSED').length, 0);
  } finally {
    cleanup();
  }
});
