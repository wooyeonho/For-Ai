#!/usr/bin/env node
// G4 red-team: attack the workflow runtime from outside its own code paths. The
// prize an attacker wants here is a second external effect, or a retry budget
// that never runs out, so most probes try to forge lease/attempt/effect rows with
// raw SQL on a throwaway migrated database.
//
//   node scripts/red-team-queue.mjs [--json evidence/REDTEAM-QUEUE-001.json]
//                                   [--db state/yeno.db] [--no-record]
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { argv, exit, stdout } from 'node:process';
import { openDb, DEFAULT_DB_PATH } from '../src/core/db.mjs';
import { migrate, MIGRATIONS_DIR } from '../src/core/migrate.mjs';
import { setStop } from '../src/core/governor.mjs';
import { recordRedteamProbe, redteamFingerprint } from '../src/domain/governance.mjs';
import {
  claimEffect,
  claimNextJob,
  commitEffect,
  completeJob,
  enqueueJob,
  failJob,
  g4Acceptance,
} from '../src/domain/workflow.mjs';

const SUITE_REF = 'scripts/red-team-queue.mjs';
const args = argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const jsonOut = flag('json');
const record = !args.includes('--no-record');
const livePath = flag('db', DEFAULT_DB_PATH);

const probes = [];
let dirs = [];

function fresh({ release = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'yeno-redteam-queue-'));
  dirs.push(dir);
  const db = openDb(join(dir, 'yeno.db'));
  migrate(db, MIGRATIONS_DIR);
  if (release) setStop(db, false, 'red-team queue probe', 'owner');
  return db;
}

/** A probe is REFUSED only when the attack ran and was actually blocked. */
function probe(bypassClass, attack, fn) {
  let outcome = 'UNVERIFIABLE';
  let detail = '';
  try {
    const result = fn();
    outcome = result.refused ? 'REFUSED' : result.unverifiable ? 'UNVERIFIABLE' : 'ALLOWED';
    detail = result.detail;
  } catch (err) {
    outcome = 'UNVERIFIABLE';
    detail = `probe crashed before it could conclude: ${err.message}`;
  }
  probes.push({ bypass_class: bypassClass, attack, outcome, detail });
}

/**
 * Raw SQL against seeded rows. A statement that changes zero rows proves
 * nothing, so it is UNVERIFIABLE rather than a refusal.
 */
function rawSql(bypassClass, attack, build, options = {}) {
  probe(bypassClass, attack, () => {
    const db = fresh(options);
    try {
      const sql = build(db);
      const info = db.prepare(sql.stmt).run(...(sql.params ?? []));
      return info.changes === 0
        ? { unverifiable: true, detail: `statement changed 0 rows, no guard exercised: ${sql.stmt}` }
        : { refused: false, detail: `raw SQL changed ${info.changes} row(s) with no refusal: ${sql.stmt}` };
    } catch (err) {
      return { refused: true, detail: `schema refused: ${err.message}` };
    } finally {
      db.close();
    }
  });
}

const EFFECT = { kind: 'http.post', target: 'https://example.test/hook', payload: { body: 'once' } };

/** A job mid-flight: leased, with one open effect claim. */
function seedInFlight(db, over = {}) {
  const { job_id: jobId } = enqueueJob(db, { kind: 'work', payload: { n: 1 }, maxAttempts: 2, ...over });
  const lease = claimNextJob(db, { worker: 'worker-a', leaseMs: 600_000 });
  return { jobId, lease };
}

function seedCommittedEffect(db) {
  const { jobId, lease } = seedInFlight(db);
  const claim = claimEffect(db, { jobId, worker: 'worker-a', leaseToken: lease.lease_token, ...EFFECT });
  commitEffect(db, claim.effect_id, 'evidence/RUN-007.md');
  return { jobId, lease, claim };
}

function seedDeadLetter(db) {
  const { job_id: jobId } = enqueueJob(db, { kind: 'flaky', payload: { n: 9 }, maxAttempts: 1 });
  const lease = claimNextJob(db, { worker: 'worker-a', leaseMs: 600_000 });
  failJob(db, { jobId, worker: 'worker-a', leaseToken: lease.lease_token, error: 'upstream 500' });
  return jobId;
}

// ---------------------------------------------------------------------------
// LEASE — stealing or forging the fencing token
// ---------------------------------------------------------------------------

rawSql('LEASE', 'steal a live job lease with raw SQL', (db) => {
  const { jobId } = seedInFlight(db);
  return {
    stmt: `UPDATE jobs SET leased_by = 'attacker', lease_expires_at = '2099-01-01T00:00:00Z' WHERE job_id = ?`,
    params: [jobId],
  };
});

rawSql('LEASE', 'rewind the fencing token so an old worker token becomes current again', (db) => {
  const { jobId } = seedInFlight(db);
  return { stmt: 'UPDATE jobs SET lease_epoch = 0 WHERE job_id = ?', params: [jobId] };
});

rawSql('LEASE', 'hand out a lease token that is not the current epoch', (db) => {
  const { jobId } = seedInFlight(db);
  return { stmt: 'UPDATE jobs SET lease_token = 99 WHERE job_id = ?', params: [jobId] };
});

probe('LEASE', 'complete a job through the domain API with a stale fencing token', () => {
  const db = fresh();
  try {
    const { jobId } = seedInFlight(db, { maxAttempts: 3 });
    db.prepare("UPDATE jobs SET lease_expires_at = '2000-01-01T00:00:00Z' WHERE job_id = ?").run(jobId);
    // A new worker takes over, so the first worker's token is now stale.
    db.prepare("UPDATE jobs SET available_at = '2000-01-01T00:00:00Z' WHERE job_id = ?").run(jobId);
    completeJob(db, { jobId, worker: 'worker-a', leaseToken: 1 });
    return { refused: false, detail: 'a zombie worker completed a job it no longer held' };
  } catch (err) {
    return { refused: true, detail: `refused: ${err.message}` };
  } finally {
    db.close();
  }
});

probe('LEASE', 'lease a job while the emergency stop is engaged', () => {
  const db = fresh();
  try {
    enqueueJob(db, { kind: 'work', payload: { n: 1 } });
    setStop(db, true, 'red-team probe', 'owner');
    const leased = claimNextJob(db, { worker: 'attacker' });
    return leased === null
      ? { refused: true, detail: 'the queue handed out nothing while stopped' }
      : { refused: false, detail: `a job was leased while stopped: ${leased.job_id}` };
  } finally {
    db.close();
  }
});

rawSql(
  'EMERGENCY_STOP',
  'flip a job to LEASED with raw SQL while the emergency stop is engaged',
  (db) => {
    setStop(db, false, 'seed', 'owner');
    const { job_id: jobId } = enqueueJob(db, { kind: 'work', payload: { n: 1 } });
    setStop(db, true, 'red-team probe', 'owner');
    return {
      stmt: `UPDATE jobs SET state = 'LEASED', leased_by = 'attacker', lease_epoch = 1, lease_token = 1,
               lease_expires_at = '2099-01-01T00:00:00Z' WHERE job_id = ?`,
      params: [jobId],
    };
  },
  { release: false },
);

rawSql(
  'EMERGENCY_STOP',
  'queue an external-effect job while the emergency stop is engaged',
  () => ({
    stmt: `INSERT INTO jobs (job_id, queue, kind, payload_json, payload_hash, dedupe_key, authority, state,
             available_at, created_at, updated_at)
           VALUES ('JOB-forged','default','git.push','{}','${'0'.repeat(64)}','forged','A3','READY',
                   '2026-08-26T00:00:00Z','2026-08-26T00:00:00Z','2026-08-26T00:00:00Z')`,
  }),
  { release: false },
);

// ---------------------------------------------------------------------------
// RAW_SQL — forging the retry budget and job identity
// ---------------------------------------------------------------------------

rawSql('RAW_SQL', 'rewind the attempt counter to buy extra retries', (db) => {
  const { jobId } = seedInFlight(db);
  return { stmt: 'UPDATE jobs SET attempt = 0 WHERE job_id = ?', params: [jobId] };
});

rawSql('RAW_SQL', 'swap the payload of a queued job so a retry does different work', (db) => {
  const { job_id: jobId } = enqueueJob(db, { kind: 'work', payload: { n: 1 } });
  return { stmt: `UPDATE jobs SET payload_json = '{"n":666}' WHERE job_id = ?`, params: [jobId] };
});

rawSql('RAW_SQL', 'raise the retry ceiling of a dead-lettered job and revive it', (db) => {
  const jobId = seedDeadLetter(db);
  return { stmt: `UPDATE jobs SET state = 'READY' WHERE job_id = ?`, params: [jobId] };
});

rawSql('RAW_SQL', 'delete a job to erase the fact that it ran', (db) => {
  const { jobId } = seedInFlight(db);
  return { stmt: 'DELETE FROM jobs WHERE job_id = ?', params: [jobId] };
});

rawSql('RAW_SQL', 'dead-letter a job with no recorded error', (db) => {
  const { job_id: jobId } = enqueueJob(db, { kind: 'work', payload: { n: 1 } });
  return { stmt: `UPDATE jobs SET state = 'DEAD_LETTER' WHERE job_id = ?`, params: [jobId] };
});

rawSql('RAW_SQL', 'resurrect a finished job for one more run at the outside world', (db) => {
  const { jobId, lease } = seedInFlight(db);
  completeJob(db, { jobId, worker: 'worker-a', leaseToken: lease.lease_token });
  return { stmt: `UPDATE jobs SET state = 'READY' WHERE job_id = ?`, params: [jobId] };
});

// ---------------------------------------------------------------------------
// EVIDENCE — attempt history and effect records
// ---------------------------------------------------------------------------

rawSql('EVIDENCE', 'delete attempt history', (db) => {
  const { jobId } = seedInFlight(db);
  return { stmt: 'DELETE FROM job_attempts WHERE job_id = ?', params: [jobId] };
});

rawSql('EVIDENCE', 'rewrite a closed attempt outcome to hide a failure', (db) => {
  const jobId = seedDeadLetter(db);
  return { stmt: `UPDATE job_attempts SET outcome = 'DONE', error = NULL WHERE job_id = ?`, params: [jobId] };
});

rawSql('EVIDENCE', 'reassign a recorded attempt to a different worker', (db) => {
  const { jobId } = seedInFlight(db);
  return { stmt: `UPDATE job_attempts SET worker = 'someone-else' WHERE job_id = ?`, params: [jobId] };
});

rawSql('EVIDENCE', 'delete a committed external effect record', (db) => {
  const { claim } = seedCommittedEffect(db);
  return { stmt: 'DELETE FROM external_effects WHERE effect_id = ?', params: [claim.effect_id] };
});

rawSql('EVIDENCE', 'mark an effect committed with no evidence of what happened', (db) => {
  const { jobId, lease } = seedInFlight(db);
  const claim = claimEffect(db, { jobId, worker: 'worker-a', leaseToken: lease.lease_token, ...EFFECT });
  return { stmt: `UPDATE external_effects SET state = 'COMMITTED' WHERE effect_id = ?`, params: [claim.effect_id] };
});

rawSql('EVIDENCE', 'downgrade a committed effect to ABANDONED to free its idempotency key', (db) => {
  const { claim } = seedCommittedEffect(db);
  return { stmt: `UPDATE external_effects SET state = 'ABANDONED' WHERE effect_id = ?`, params: [claim.effect_id] };
});

rawSql('EVIDENCE', 'repoint a claimed effect at a different target after the claim', (db) => {
  const { jobId, lease } = seedInFlight(db);
  const claim = claimEffect(db, { jobId, worker: 'worker-a', leaseToken: lease.lease_token, ...EFFECT });
  return {
    stmt: `UPDATE external_effects SET target = 'https://elsewhere.test' WHERE effect_id = ?`,
    params: [claim.effect_id],
  };
});

rawSql('EVIDENCE', 'record a queue soak cycle as ok even though the effect happened twice', () => ({
  stmt: `INSERT INTO queue_soak_cycles (cycle_id, soak_ref, cycle, kill_point, job_id, idempotency_key,
           effect_lines, resumed_outcome, ok, detail, observed_at)
         VALUES ('QSC-forged','QSOAK-forged',1,'after-effect','JOB-x','${'0'.repeat(64)}',2,'done=JOB-x',1,
                 'forged clean sweep','2026-08-26T00:00:00Z')`,
}));

rawSql('EVIDENCE', 'rewrite a failed queue soak cycle into a pass', (db) => {
  db.prepare(
    `INSERT INTO queue_soak_cycles (cycle_id, soak_ref, cycle, kill_point, job_id, idempotency_key,
       effect_lines, resumed_outcome, ok, detail, observed_at)
     VALUES ('QSC-seed','QSOAK-seed',1,'after-effect','JOB-x','${'0'.repeat(64)}',1,'done=JOB-x',0,
             'seeded failure','2026-08-26T00:00:00Z')`,
  ).run();
  return { stmt: "UPDATE queue_soak_cycles SET ok = 1 WHERE cycle_id = 'QSC-seed'" };
});

// ---------------------------------------------------------------------------
// GOVERNOR_API / APPROVAL — duplicate effects and unapproved authority
// ---------------------------------------------------------------------------

probe('GOVERNOR_API', 'perform the same external effect twice through the domain API', () => {
  const db = fresh();
  try {
    const { claim } = seedCommittedEffect(db);
    const { jobId, lease } = seedInFlight(db, { kind: 'work2', payload: { n: 2 } });
    const again = claimEffect(db, { jobId, worker: 'worker-a', leaseToken: lease.lease_token, ...EFFECT });
    return again.ok
      ? { refused: false, detail: `a second claim was granted for the same intent (first ${claim.effect_id})` }
      : { refused: true, detail: `refused: ${again.reason}` };
  } finally {
    db.close();
  }
});

rawSql('GOVERNOR_API', 'insert a second committed effect row for one idempotency key', (db) => {
  const { claim } = seedCommittedEffect(db);
  const row = db.prepare('SELECT * FROM external_effects WHERE effect_id = ?').get(claim.effect_id);
  return {
    stmt: `INSERT INTO external_effects (effect_id, idempotency_key, job_id, attempt, kind, target,
             payload_hash, state, claimed_at, settled_at, evidence_ref)
           VALUES ('EFF-forged', ?, ?, 1, ?, ?, ?, 'COMMITTED', ?, ?, 'evidence/RUN-007.md')`,
    params: [row.idempotency_key, row.job_id, row.kind, row.target, row.payload_hash, row.claimed_at, row.claimed_at],
  };
});

probe('APPROVAL_REPLAY', 'claim an A3 external effect with no Owner approval at all', () => {
  const db = fresh();
  try {
    const { jobId, lease } = seedInFlight(db, { kind: 'git.push', payload: { sha: 'abc' }, authority: 'A3' });
    claimEffect(db, { jobId, worker: 'worker-a', leaseToken: lease.lease_token, ...EFFECT });
    return { refused: false, detail: 'an A3 effect was claimed without an approval' };
  } catch (err) {
    return { refused: true, detail: `refused: ${err.message}` };
  } finally {
    db.close();
  }
});

rawSql('APPROVAL_REPLAY', 'insert a high-authority effect claim with a NULL approval', (db) => {
  const { jobId } = seedInFlight(db, { kind: 'git.push', payload: { sha: 'abc' }, authority: 'A3' });
  return {
    stmt: `INSERT INTO external_effects (effect_id, idempotency_key, job_id, attempt, kind, target,
             payload_hash, state, claimed_at)
           VALUES ('EFF-forged2','${'a'.repeat(64)}', ?, 1, 'git.push','origin/main','${'0'.repeat(64)}',
                   'CLAIMED','2026-08-26T00:00:00Z')`,
    params: [jobId],
  };
});

// ---------------------------------------------------------------------------
// BUDGET — the scheduler must stay off unless the Owner turns it on
// ---------------------------------------------------------------------------

rawSql('BUDGET', 'enable the scheduler as a non-Owner actor', () => ({
  stmt: `UPDATE scheduler_state SET enabled = 1, reason = 'pwned', changed_by = 'attacker',
           changed_at = '2026-08-26T00:00:00Z' WHERE id = 1`,
}));

rawSql('BUDGET', 'enable the scheduler with no recorded reason', () => ({
  stmt: `UPDATE scheduler_state SET enabled = 1, reason = NULL, changed_by = 'owner',
           changed_at = '2026-08-26T00:00:00Z' WHERE id = 1`,
}));

rawSql('BUDGET', 'delete the scheduler row so its default disappears', () => ({
  stmt: 'DELETE FROM scheduler_state WHERE id = 1',
}));

// ---------------------------------------------------------------------------
// Negative controls: with the guard removed, the same attack must SUCCEED.
// ---------------------------------------------------------------------------

const controls = [];

function control(name, triggers, attack) {
  const db = fresh();
  try {
    for (const t of triggers) db.prepare(`DROP TRIGGER ${t}`).run();
    const info = attack(db);
    controls.push({
      control: name,
      dropped: triggers,
      bypassed: info.changes > 0,
      detail: `${info.changes} row(s) changed with the guard removed`,
    });
  } catch (err) {
    controls.push({ control: name, dropped: triggers, bypassed: false, detail: `still refused: ${err.message}` });
  } finally {
    db.close();
  }
}

control('lease epoch rewind', ['trg_jobs_lease_epoch_monotonic', 'trg_jobs_lease_token_is_epoch'], (db) => {
  const { jobId } = seedInFlight(db);
  return db.prepare('UPDATE jobs SET lease_epoch = 0 WHERE job_id = ?').run(jobId);
});

control('attempt counter rewind', ['trg_jobs_attempt_monotonic'], (db) => {
  const { jobId } = seedInFlight(db);
  return db.prepare('UPDATE jobs SET attempt = 0 WHERE job_id = ?').run(jobId);
});

control('attempt history deletion', ['trg_job_attempts_no_delete'], (db) => {
  const { jobId } = seedInFlight(db);
  return db.prepare('DELETE FROM job_attempts WHERE job_id = ?').run(jobId);
});

control('committed effect downgrade', ['trg_effects_committed_is_final'], (db) => {
  const { claim } = seedCommittedEffect(db);
  return db.prepare(`UPDATE external_effects SET state = 'ABANDONED' WHERE effect_id = ?`).run(claim.effect_id);
});

control('scheduler self-enable', ['trg_scheduler_enable_needs_owner'], (db) =>
  db
    .prepare(
      `UPDATE scheduler_state SET enabled = 1, reason = 'pwned', changed_by = 'attacker',
         changed_at = '2026-08-26T00:00:00Z' WHERE id = 1`,
    )
    .run(),
);

control('forged soak verdict', ['trg_queue_soak_honest_verdict'], (db) =>
  db
    .prepare(
      `INSERT INTO queue_soak_cycles (cycle_id, soak_ref, cycle, kill_point, job_id, idempotency_key,
         effect_lines, resumed_outcome, ok, detail, observed_at)
       VALUES ('QSC-control','QSOAK-control',1,'after-effect','JOB-x','${'0'.repeat(64)}',2,'done',1,
               'forged','2026-08-26T00:00:00Z')`,
    )
    .run(),
);

const deadControls = controls.filter((c) => !c.bypassed);

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const refused = probes.filter((p) => p.outcome === 'REFUSED').length;
const allowed = probes.filter((p) => p.outcome === 'ALLOWED');
const unverifiable = probes.filter((p) => p.outcome === 'UNVERIFIABLE');

for (const p of probes) {
  stdout.write(`${p.outcome.padEnd(12)} ${p.bypass_class.padEnd(18)} ${p.attack}\n`);
  if (p.outcome !== 'REFUSED') stdout.write(`             -> ${p.detail}\n`);
}

let acceptance = null;
if (record) {
  const live = openDb(livePath);
  try {
    for (const p of probes) {
      recordRedteamProbe(live, {
        suiteRef: SUITE_REF,
        bypassClass: p.bypass_class,
        attack: p.attack,
        outcome: p.outcome,
        detail: p.detail,
        evidenceRef: jsonOut,
      });
    }
    acceptance = g4Acceptance(live);
  } finally {
    live.close();
  }
}

const report = {
  generated_at: new Date().toISOString(),
  suite_ref: SUITE_REF,
  fingerprint: redteamFingerprint(probes),
  totals: { total: probes.length, refused, allowed: allowed.length, unverifiable: unverifiable.length },
  acceptance,
  probes,
  negative_controls: controls,
};

if (jsonOut) {
  writeFileSync(join(new URL('..', import.meta.url).pathname, jsonOut), `${JSON.stringify(report, null, 2)}\n`);
  stdout.write(`\nreport: ${jsonOut}\n`);
}

for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
dirs = [];

stdout.write(
  `\nqueue red-team probes: ${probes.length}, refused: ${refused}, allowed: ${allowed.length}, unverifiable: ${unverifiable.length}\n`,
);
stdout.write(
  `negative controls: ${controls.length}, bypassed with the guard removed: ${controls.length - deadControls.length}\n`,
);
for (const c of deadControls) stdout.write(`CONTROL_DEAD ${c.control}: ${c.detail}\n`);
if (allowed.length > 0 || unverifiable.length > 0 || deadControls.length > 0) {
  stdout.write('REDTEAM_QUEUE_FAIL\n');
  exit(1);
}
stdout.write('REDTEAM_QUEUE_PASS\n');
exit(0);
