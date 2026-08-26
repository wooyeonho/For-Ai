#!/usr/bin/env node
// G1 durability soak. Each cycle does real violence to a real ledger: a child
// writer is SIGKILLed mid-append, restarted, replayed, verified, backed up,
// restored into a fresh file, and the write lease is fenced. Every check writes
// a probe row into the kernel DB, and the session can only read PASSED out of
// those rows.
//
//   node scripts/soak.mjs --cycles 8 --batch 40
//   node scripts/soak.mjs --cycles 200 --batch 100 --minutes 120   # long run
//
// The soaked ledger is a scratch DB so a soak never mutates the kernel's own
// event chain; only the evidence rows land in state/yeno.db.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { openDb, integrityCheck } from '../src/core/db.mjs';
import { migrate } from '../src/core/migrate.mjs';
import { verifyChain, head } from '../src/core/events.mjs';
import { rebuild, snapshotHash, catchUp } from '../src/core/projections.mjs';
import { canonicalJson } from '../src/core/hash.mjs';
import { createBackup, verifyBackup, restoreBackup } from '../src/core/backup.mjs';
import { acquireLease, assertFencingToken, reclaimExpiredLeases } from '../src/core/lease.mjs';
import { finishSoak, noteCycle, recordProbe, soakReport, startSoak } from '../src/domain/soak.mjs';

const REPO = new URL('..', import.meta.url).pathname;
const CRASH_WRITER = join(REPO, 'scripts', 'crash-writer.mjs');
const MIGRATIONS = join(REPO, 'migrations');

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1]);
const cycles = Number(args.get('cycles') ?? 4);
const batch = Number(args.get('batch') ?? 20);
const minutes = args.get('minutes') === undefined ? null : Number(args.get('minutes'));
const kernelDbPath = args.get('db') ?? process.env.YENO_DB ?? 'state/yeno.db';
const runRef = args.get('run-ref') ?? null;
const keepScratch = args.get('keep-scratch') !== undefined;
// Short CI soaks are throwaway noise; only a deliberate acceptance run writes
// into the committed evidence directory.
const evidenceDir = (args.get('evidence-dir') ?? 'evidence').replace(/\/+$/, '');

const deadline = minutes === null ? null : Date.now() + minutes * 60_000;
const scratchDir = mkdtempSync(join(tmpdir(), 'yeno-soak-'));
const scratchDb = join(scratchDir, 'yeno.db');
const backupDir = join(scratchDir, 'backups');

const kernel = openDb(kernelDbPath);
migrate(kernel, MIGRATIONS);

function runWriter(extra) {
  return spawnSync(
    process.execPath,
    [CRASH_WRITER, '--db', scratchDb, '--migrations', MIGRATIONS, '--events', String(batch), ...extra],
    { cwd: REPO, encoding: 'utf8' },
  );
}

function timed(fn) {
  const started = Date.now();
  try {
    const detail = fn();
    return { ok: true, detail, durationMs: Date.now() - started };
  } catch (err) {
    return { ok: false, detail: `${err.name}: ${err.message}`, durationMs: Date.now() - started };
  }
}

/** One cycle. Returns the probe results plus how much damage it actually did. */
async function cycle(n) {
  const prefix = `EVT-soak-${n}`;
  const killAfter = Math.max(1, Math.floor(batch / 2));
  const probes = [];
  let kills = 0;
  let restores = 0;

  const crash = timed(() => {
    const killed = runWriter(['--kill-after', String(killAfter), '--prefix', prefix]);
    if (killed.signal !== 'SIGKILL') throw new Error(`writer was not SIGKILLed: signal=${killed.signal} status=${killed.status}`);
    kills += 1;

    const afterCrash = openDb(scratchDb);
    let idsAfterCrash;
    try {
      const chain = verifyChain(afterCrash);
      if (!chain.ok) throw new Error(`chain broken after crash: ${chain.reason} at ${chain.brokenAt}`);
      idsAfterCrash = afterCrash
        .prepare('SELECT event_id FROM events WHERE event_id LIKE ? ORDER BY seq')
        .all(`${prefix}-%`)
        .map((r) => r.event_id);
      if (idsAfterCrash.length !== killAfter) {
        throw new Error(`durability loss: committed ${idsAfterCrash.length} of ${killAfter} pre-kill events`);
      }
    } finally {
      afterCrash.close();
    }

    const resumed = runWriter(['--prefix', prefix]);
    if (resumed.status !== 0) throw new Error(`resume failed: ${resumed.stderr.trim()}`);

    const after = openDb(scratchDb);
    try {
      const ids = after
        .prepare('SELECT event_id FROM events WHERE event_id LIKE ? ORDER BY seq')
        .all(`${prefix}-%`)
        .map((r) => r.event_id);
      if (ids.length !== batch) throw new Error(`replay produced ${ids.length} events, expected ${batch}`);
      if (new Set(ids).size !== batch) throw new Error('replay duplicated event ids');
      if (canonicalJson(ids.slice(0, killAfter)) !== canonicalJson(idsAfterCrash)) {
        throw new Error('replay rewrote pre-crash event ids');
      }
    } finally {
      after.close();
    }
    return `SIGKILL after ${killAfter}/${batch}; resumed to ${batch} without duplicates`;
  });
  probes.push({ kind: 'CRASH_REPLAY', ...crash });

  const db = openDb(scratchDb);
  try {
    const chain = timed(() => {
      const result = verifyChain(db);
      if (!result.ok) throw new Error(`${result.reason} at seq ${result.brokenAt ?? '?'}`);
      return `${result.count} events, head ${result.headHash.slice(0, 12)}`;
    });
    probes.push({ kind: 'CHAIN_VERIFY', ...chain });

    const determinism = timed(() => {
      catchUp(db);
      const before = canonicalJson(snapshotHash(db));
      rebuild(db);
      const after = canonicalJson(snapshotHash(db));
      if (before !== after) throw new Error('projection rebuild is not deterministic');
      return `projection snapshot stable across rebuild (${JSON.parse(before).length} rows)`;
    });
    probes.push({ kind: 'PROJECTION_DETERMINISM', ...determinism });

    const integrity = timed(() => {
      const result = integrityCheck(db);
      if (result !== 'ok') throw new Error(result);
      return 'PRAGMA integrity_check = ok';
    });
    probes.push({ kind: 'INTEGRITY', ...integrity });

    const fencing = timed(() => {
      const resource = `soak-ledger-${n}`;
      const first = acquireLease(db, resource, 'writer-a', 1, { now: () => Date.now() - 10_000 });
      if (!first.ok) throw new Error('first lease was refused');
      reclaimExpiredLeases(db);
      const second = acquireLease(db, resource, 'writer-b', 60_000);
      if (!second.ok) throw new Error('expired lease was not reclaimable');
      if (second.fencingToken <= first.fencingToken) throw new Error('fencing token did not advance');
      let stale = false;
      try {
        assertFencingToken(db, resource, first.fencingToken);
      } catch {
        stale = true;
      }
      if (!stale) throw new Error('stale writer was accepted after reclaim');
      return `token ${first.fencingToken} -> ${second.fencingToken}, stale writer fenced`;
    });
    probes.push({ kind: 'LEASE_FENCING', ...fencing });

    const started = Date.now();
    let restoreDetail;
    let restoreOk = true;
    try {
      const backup = await createBackup(db, { dir: backupDir });
      const verified = await verifyBackup(backup.path, { liveDb: db });
      if (!verified.ok) throw new Error(`backup verify: ${verified.problems.join(' | ')}`);
      const target = join(scratchDir, `restored-${n}.db`);
      const restored = await restoreBackup(backup.path, target);
      if (!restored.ok) throw new Error(`restore integrity ${restored.integrity}`);
      const liveHead = head(db).hash;
      if (restored.headHash !== liveHead) throw new Error('restored head hash differs from live head');
      restores += 1;
      rmSync(target, { force: true });
      restoreDetail = `backup ${backup.backupId} verified and restored at head ${liveHead.slice(0, 12)} (${restored.eventCount} events)`;
    } catch (err) {
      restoreOk = false;
      restoreDetail = `${err.name}: ${err.message}`;
    }
    probes.push({ kind: 'BACKUP_RESTORE', ok: restoreOk, detail: restoreDetail, durationMs: Date.now() - started });

    return { probes, kills, restores, events: batch, headHash: head(db).hash };
  } finally {
    db.close();
  }
}

const soakId = startSoak(kernel, { plannedCycles: cycles, runRef, host: hostname() });
process.stdout.write(`soak ${soakId}: ${cycles} cycles x ${batch} events, scratch ${scratchDb}\n`);

let aborted = false;
let headHash = null;
let failure = null;

try {
  for (let n = 1; n <= cycles; n += 1) {
    if (deadline !== null && Date.now() > deadline) {
      aborted = true;
      failure = `time budget of ${minutes} minutes exhausted after ${n - 1} cycles`;
      break;
    }
    const result = await cycle(n);
    for (const probe of result.probes) {
      recordProbe(kernel, soakId, { cycle: n, kind: probe.kind, ok: probe.ok, detail: probe.detail, durationMs: probe.durationMs });
    }
    noteCycle(kernel, soakId, { kills: result.kills, restores: result.restores, events: result.events });
    headHash = result.headHash;
    const failed = result.probes.filter((p) => !p.ok);
    process.stdout.write(
      `cycle ${n}/${cycles}: ${result.probes.length - failed.length}/${result.probes.length} probes ok` +
        (failed.length > 0 ? ` — ${failed.map((p) => `${p.kind}: ${p.detail}`).join(' | ')}\n` : '\n'),
    );
  }
} catch (err) {
  aborted = true;
  failure = `soak crashed: ${err.stack}`;
}

mkdirSync(join(REPO, evidenceDir), { recursive: true });
const evidenceRef = `${evidenceDir}/${soakId}.json`;
const outcome = finishSoak(kernel, soakId, { headHash, evidenceRef, aborted, failure });
const report = soakReport(kernel, soakId);
writeFileSync(
  join(REPO, evidenceRef),
  `${JSON.stringify({ kind: 'yeno-soak-evidence', version: 1, soak_id: soakId, outcome, report }, null, 2)}\n`,
);
kernel.close();
if (!keepScratch) rmSync(scratchDir, { recursive: true, force: true });

process.stdout.write(`${evidenceRef}\n`);
if (outcome.state === 'PASSED') {
  process.stdout.write(`SOAK_PASS ${soakId}\n`);
  process.exit(0);
}
process.stderr.write(`SOAK_${outcome.state} ${soakId}: ${outcome.reasons.join('; ')}\n`);
process.exit(1);
