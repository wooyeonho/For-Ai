import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './helpers.mjs';
import {
  startRun,
  checkpointRun,
  openBlocker,
  settleBlocker,
  queueNextRun,
  takeNextRun,
  handoffReport,
  pendingNextRuns,
  waitingNextRuns,
} from '../src/domain/handoff.mjs';
import { verifyReport } from '../src/domain/status.mjs';

const RUN = { runRef: 'RUN-TEST-1', gateId: 'G1', goal: 'durable truth slice', baselineRef: 'BASELINE-20260826' };

test('a session cannot checkpoint without a queued NEXT_RUN', (t) => {
  const { db, cleanup } = freshDb();
  t.after(cleanup);
  startRun(db, RUN);
  assert.throws(
    () => checkpointRun(db, RUN.runRef, { report: 'report body' }),
    /checkpoint requires a report and an unblocked NEXT_RUN/,
  );
});

test('a session cannot checkpoint without a report', (t) => {
  const { db, cleanup } = freshDb();
  t.after(cleanup);
  startRun(db, RUN);
  queueNextRun(db, { gateId: 'G1', exactAction: 'soak test', rationale: 'G1 evidence' });
  assert.throws(() => checkpointRun(db, RUN.runRef, { report: '' }), /requires a report/);
});

test('checkpoint succeeds once report and unblocked NEXT_RUN exist', (t) => {
  const { db, cleanup } = freshDb();
  t.after(cleanup);
  startRun(db, RUN);
  queueNextRun(db, { gateId: 'G1', exactAction: 'soak test', rationale: 'G1 evidence' });
  const run = checkpointRun(db, RUN.runRef, { report: '8-line checkpoint', evidenceRef: 'EV-1' });
  assert.equal(run.state, 'CHECKPOINTED');
  assert.equal(run.evidence_ref, 'EV-1');
});

test('CLOSED_PASS still requires evidence', (t) => {
  const { db, cleanup } = freshDb();
  t.after(cleanup);
  startRun(db, RUN);
  queueNextRun(db, { gateId: 'G1', exactAction: 'soak test', rationale: 'G1 evidence' });
  assert.throws(
    () => checkpointRun(db, RUN.runRef, { report: 'r', state: 'CLOSED_PASS' }),
    /CLOSED_PASS session requires evidence_ref/,
  );
});

test('a NEXT_RUN blocked by a WAITING blocker does not satisfy continuity', (t) => {
  const { db, cleanup } = freshDb();
  t.after(cleanup);
  startRun(db, RUN);
  const blocker = openBlocker(db, {
    kind: 'PROVIDER_ACCESS',
    neededFrom: 'OWNER',
    title: 'no provider auth',
    detail: 'G5 needs Claude/Codex/Devin credentials',
  });
  queueNextRun(db, {
    gateId: 'G5',
    exactAction: 'run bounded live provider RUN',
    rationale: 'G5 evidence',
    blockedBy: blocker.blocker_id,
  });

  assert.equal(pendingNextRuns(db).length, 0);
  assert.equal(waitingNextRuns(db).length, 1);
  assert.throws(() => checkpointRun(db, RUN.runRef, { report: 'r' }), /unblocked NEXT_RUN/);

  settleBlocker(db, blocker.blocker_id, { resolution: 'owner supplied credentials' });
  assert.equal(pendingNextRuns(db).length, 1);
  assert.equal(checkpointRun(db, RUN.runRef, { report: 'r' }).state, 'CHECKPOINTED');
});

test('settling a blocker requires a resolution and is recorded once', (t) => {
  const { db, cleanup } = freshDb();
  t.after(cleanup);
  const blocker = openBlocker(db, {
    kind: 'SOURCE',
    neededFrom: 'OWNER',
    title: 'official chat export missing',
    detail: 'G2 semantic promotion stays blocked',
    workaround: 'keep building local parser + coverage invariants',
  });
  assert.throws(() => settleBlocker(db, blocker.blocker_id, { resolution: '' }), /requires a resolution/);
  settleBlocker(db, blocker.blocker_id, { resolution: 'export delivered' });
  const again = settleBlocker(db, blocker.blocker_id, { resolution: 'export delivered' });
  assert.equal(again.idempotent, true);
});

test('a NEXT_RUN entry is consumed exactly once and never deleted', (t) => {
  const { db, cleanup } = freshDb();
  t.after(cleanup);
  startRun(db, RUN);
  queueNextRun(db, { nextId: 'NXT-1', gateId: 'G1', exactAction: 'first', rationale: 'r', priority: 10 });
  queueNextRun(db, { nextId: 'NXT-2', gateId: 'G1', exactAction: 'second', rationale: 'r', priority: 1 });

  assert.equal(takeNextRun(db, RUN.runRef).next_id, 'NXT-1');
  assert.equal(takeNextRun(db, RUN.runRef).next_id, 'NXT-2');
  assert.equal(takeNextRun(db, RUN.runRef), null);

  assert.throws(
    () => db.prepare("UPDATE next_run SET consumed_at = '2026-01-01T00:00:00Z' WHERE next_id = 'NXT-1'").run(),
    /already consumed/,
  );
  assert.throws(() => db.prepare("DELETE FROM next_run WHERE next_id = 'NXT-1'").run(), /append-only/);
});

test('starting the same run twice is idempotent and appends one event', (t) => {
  const { db, cleanup } = freshDb();
  t.after(cleanup);
  startRun(db, RUN);
  const second = startRun(db, RUN);
  assert.equal(second.idempotent, true);
  const n = db.prepare("SELECT COUNT(*) AS n FROM events WHERE type = 'session.run_started'").get().n;
  assert.equal(n, 1);
});

test('verify fails when a finished session left no unblocked NEXT_RUN', (t) => {
  const { db, cleanup } = freshDb();
  t.after(cleanup);
  assert.equal(verifyReport(db).failed.includes('open_mission_has_next_run'), false);

  startRun(db, RUN);
  queueNextRun(db, { nextId: 'NXT-1', gateId: 'G1', exactAction: 'continue G1', rationale: 'mission runs to G14' });
  checkpointRun(db, RUN.runRef, { report: '8-line checkpoint' });
  assert.equal(verifyReport(db).failed.includes('open_mission_has_next_run'), false);

  // The next session consumes the entry; leaving nothing behind is a failure.
  startRun(db, { ...RUN, runRef: 'RUN-TEST-2' });
  takeNextRun(db, 'RUN-TEST-2');
  assert.equal(verifyReport(db).failed.includes('open_mission_has_next_run'), true);

  queueNextRun(db, { gateId: 'G2', exactAction: 'coverage invariants', rationale: 'next gate' });
  assert.equal(verifyReport(db).failed.includes('open_mission_has_next_run'), false);
});

test('handoff report carries state, blockers and the next exact action', (t) => {
  const { db, cleanup } = freshDb();
  t.after(cleanup);
  startRun(db, RUN);
  const blocker = openBlocker(db, {
    kind: 'OWNER_APPROVAL',
    neededFrom: 'OWNER',
    title: 'merge approval',
    detail: 'PR merge is an Owner boundary',
  });
  queueNextRun(db, { gateId: 'G1', exactAction: 'harden G1 durability', rationale: 'gate order', priority: 50 });
  queueNextRun(db, {
    gateId: 'G0',
    exactAction: 'merge PR',
    rationale: 'owner boundary',
    blockedBy: blocker.blocker_id,
  });

  const report = handoffReport(db);
  assert.equal(report.next_exact_action, 'harden G1 durability');
  assert.equal(report.blockers.length, 1);
  assert.equal(report.blockers_waiting, 1);
  assert.equal(report.next_run_takeable, 1);
  assert.equal(report.next_run_waiting, 1);
  assert.equal(report.next_runs.length, 1);
  assert.equal(report.next_runs_blocked[0].blocker_kind, 'OWNER_APPROVAL');
  assert.equal(report.runs_in_progress, 1);
});
