// Gate promotion. A gate is never passed because a human (or an agent) says so:
// promotion runs the same machine checks the release train claims, and refuses
// with reasons otherwise. Every requirement below is recomputable from the DB
// and the repository, never from prose.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { verifyReport } from './status.mjs';
import { durabilityEvidence } from './soak.mjs';
import { intakeCoverage } from './intake.mjs';
import { g3Acceptance } from './governance.mjs';

const REPO_ROOT = new URL('../../', import.meta.url).pathname;

/** G1 acceptance floor: a soak short enough to be luck is not durability. */
export const G1_MIN_CYCLES = 100;

function fileExists(ref) {
  return typeof ref === 'string' && ref.length > 0 && existsSync(join(REPO_ROOT, ref));
}

/**
 * Gate-specific machine requirements. Each returns the reasons it must NOT be
 * promoted; an empty list means the evidence is actually there.
 */
const REQUIREMENTS = {
  G0: (db) => {
    const reasons = [];
    const baseline = db.prepare("SELECT COUNT(*) AS n FROM gates WHERE gate_id = 'G0'").get().n;
    if (baseline === 0) reasons.push('G0 is not registered in the release train');
    if (!fileExists('evidence/BASELINE-20260826.json')) reasons.push('baseline evidence file is missing');
    if (!fileExists('.claude/settings.json')) reasons.push('Claude permission settings are missing');
    if (!fileExists('.claude/hooks/pretooluse-guard.mjs')) reasons.push('deterministic PreToolUse guard is missing');
    return reasons;
  },
  G1: (db) => {
    const soak = durabilityEvidence(db);
    if (soak === null) return ['no passing soak session exists'];
    const reasons = [];
    if (soak.completed_cycles < G1_MIN_CYCLES) {
      reasons.push(`longest soak ran ${soak.completed_cycles} cycles, below the ${G1_MIN_CYCLES}-cycle floor`);
    }
    if (soak.kill_count < G1_MIN_CYCLES) reasons.push(`only ${soak.kill_count} SIGKILLs survived`);
    if (soak.restore_count < G1_MIN_CYCLES) reasons.push(`only ${soak.restore_count} backups restored`);
    if (!fileExists(soak.evidence_ref)) reasons.push(`soak evidence file ${soak.evidence_ref} is missing on disk`);
    return reasons;
  },
  G2: (db) => {
    const reasons = [];
    const official = db
      .prepare(
        `SELECT COUNT(*) AS n FROM source_versions sv
           JOIN sources s ON s.source_id = sv.source_id
          WHERE s.kind = 'CHAT_EXPORT' AND sv.confidence <> 'RAW'`,
      )
      .get().n;
    if (official === 0) reasons.push('NEEDS_SOURCE: no official chat export has been ingested');
    // The coverage invariant is part of acceptance, not a report: an item with no
    // next action, a body claimed without provenance, or a project promoted from
    // a title alone all block G2 even once an export exists.
    const coverage = intakeCoverage(db);
    reasons.push(...coverage.problems);
    const stillMissing = db
      .prepare("SELECT COUNT(*) AS n FROM inbox_items WHERE state IN ('BODY_MISSING','NEEDS_SOURCE')")
      .get().n;
    if (stillMissing > 0) reasons.push(`${stillMissing} inbox items still have no recovered body`);
    return reasons;
  },
  G3: (db) => {
    const acceptance = g3Acceptance(db);
    const reasons = [...acceptance.problems];
    // A governor with no recorded denial has never been attacked.
    if (acceptance.denials_recorded === 0) reasons.push('no admission denial has ever been recorded');
    const stop = db.prepare('SELECT engaged FROM emergency_stop WHERE id = 1').get();
    if (stop === undefined) reasons.push('the emergency stop row is missing');
    const unapproved = db
      .prepare("SELECT COUNT(*) AS n FROM runs WHERE authority IN ('A3','A4','A5','A6') AND approval_id IS NULL")
      .get().n;
    if (unapproved > 0) reasons.push(`${unapproved} high-authority RUN(s) exist with no Owner approval`);
    return reasons;
  },
  G5: (db) => {
    // A bounded live provider RUN is an approved A3 run that actually finished.
    const live = db
      .prepare("SELECT COUNT(*) AS n FROM runs WHERE authority = 'A3' AND state = 'DONE' AND approval_id IS NOT NULL")
      .get().n;
    return live === 0
      ? ['BLOCKED_PROVIDER_ACCESS: no provider bounded live RUN has succeeded; implementation is not acceptance']
      : [];
  },
  G6: (db) => {
    const g5 = db.prepare("SELECT state FROM gates WHERE gate_id = 'G5'").get();
    return g5.state === 'PASSED' ? [] : [`PREP_ONLY: G6 cannot be promoted while G5 is ${g5.state}`];
  },
};

/** Why `gateId` may not be promoted right now, as a list of machine reasons. */
export function promotionBlockers(db, gateId, { evidenceRef = null, migrationsDir = null } = {}) {
  const gate = db.prepare('SELECT * FROM gates WHERE gate_id = ?').get(gateId);
  if (!gate) return [`unknown gate ${gateId}`];
  const reasons = [];

  const earlier = db
    .prepare("SELECT gate_id, state FROM gates WHERE ordinal < ? AND state <> 'PASSED' ORDER BY ordinal")
    .all(gate.ordinal);
  if (earlier.length > 0) {
    reasons.push(`earlier gates not passed: ${earlier.map((g) => `${g.gate_id}=${g.state}`).join(', ')}`);
  }

  const ref = evidenceRef ?? gate.evidence_ref;
  if (!fileExists(ref)) reasons.push(`evidence file ${ref ?? '(none)'} does not exist in the repository`);

  const verify = verifyReport(db, migrationsDir === null ? {} : { migrationsDir });
  if (!verify.ok) reasons.push(`verify is failing: ${verify.failed.join(', ')}`);

  reasons.push(...(REQUIREMENTS[gateId] ? REQUIREMENTS[gateId](db) : []));
  return reasons;
}

/**
 * Promote a gate, or refuse. Returns the outcome instead of throwing so a RUN
 * can record a refusal as evidence too.
 */
export function passGate(db, gateId, { evidenceRef, migrationsDir = null }, clock = Date) {
  const reasons = promotionBlockers(db, gateId, { evidenceRef, migrationsDir });
  const at = new Date(clock.now()).toISOString();
  if (reasons.length > 0) {
    db.prepare('UPDATE gates SET blocked_reason = ?, updated_at = ? WHERE gate_id = ?').run(
      reasons.join('; '),
      at,
      gateId,
    );
    return { gate_id: gateId, promoted: false, state: db.prepare('SELECT state FROM gates WHERE gate_id = ?').get(gateId).state, reasons };
  }
  // A passed gate carries evidence, not a reason; the reason column is for why
  // something is still blocked.
  db.prepare("UPDATE gates SET state = 'PASSED', evidence_ref = ?, blocked_reason = NULL, updated_at = ? WHERE gate_id = ?").run(
    evidenceRef,
    at,
    gateId,
  );
  const next = db.prepare("SELECT gate_id FROM gates WHERE state <> 'PASSED' ORDER BY ordinal LIMIT 1").get();
  db.prepare('UPDATE release_state SET current_gate = ?, updated_at = ?, evidence_ref = ? WHERE id = 1').run(
    next?.gate_id ?? gateId,
    at,
    evidenceRef,
  );
  return { gate_id: gateId, promoted: true, state: 'PASSED', evidence_ref: evidenceRef, current_gate: next?.gate_id ?? gateId, reasons: [] };
}

export function gateReport(db) {
  return {
    generated_at: new Date().toISOString(),
    release: db.prepare('SELECT * FROM release_state WHERE id = 1').get(),
    gates: db
      .prepare('SELECT gate_id, name, state, evidence_ref, blocked_reason FROM gates ORDER BY ordinal')
      .all()
      .map((g) => ({ ...g, evidence_present: fileExists(g.evidence_ref) })),
  };
}
