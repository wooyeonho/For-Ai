import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, fixedClock, MIGRATIONS } from './helpers.mjs';
import { openDb } from '../src/core/db.mjs';
import { migrate } from '../src/core/migrate.mjs';
import {
  remember,
  supersede,
  recall,
  observe,
  activateDesires,
  proposeGoal,
  openCouncil,
  argue,
  decide,
  abandonGoal,
  publishIdentity,
  answerSelfModel,
  selfReport,
  goalTrace,
} from '../src/domain/self.mjs';

function pressureGoal(db, clock) {
  observe(db, 'waiting_blockers', 9, clock);
  const [activation] = activateDesires(db, clock).filter((a) => a.desire_id === 'D-OWNER');
  return proposeGoal(
    db,
    {
      statement: 'draft one Owner packet that clears the waiting blockers',
      rationale: 'waiting_blockers is 9 against a target of 0 with tolerance 2',
      activationId: activation.activation_id,
      priorityRaw: 70,
    },
    clock,
  );
}

function debate(db, goalId, clock, { forText = 'clears the highest-pressure metric', againstText = 'costs Owner attention' } = {}) {
  const council = openCouncil(db, goalId, clock);
  argue(db, council.council_id, { role: 'PROPOSER', stance: 'FOR', argument: forText }, clock);
  argue(db, council.council_id, { role: 'COST', stance: 'AGAINST', argument: againstText }, clock);
  return council;
}

test('G6 stays PREP_ONLY and is never promoted by implementation alone', (t) => {
  const { db, cleanup } = freshDb();
  t.after(cleanup);
  const g6 = db.prepare("SELECT * FROM gates WHERE gate_id = 'G6'").get();
  assert.equal(g6.state, 'PENDING');
  assert.match(g6.blocked_reason, /PREP_ONLY/);
  const g5 = db.prepare("SELECT * FROM gates WHERE gate_id = 'G5'").get();
  assert.equal(g5.state, 'PENDING');
  assert.match(g5.blocked_reason, /BLOCKED_PROVIDER_ACCESS/);
  assert.equal(selfReport(db).prep_only, true);
});

test('memory is append-only and correction supersedes instead of rewriting', (t) => {
  const { db, cleanup } = freshDb();
  t.after(cleanup);
  const clock = fixedClock();
  const first = remember(
    db,
    { kind: 'SEMANTIC', content: 'unresolved inbox is 143', sourceRef: 'BASELINE-20260826', confidence: 0.4, salience: 50 },
    clock,
  );
  supersede(
    db,
    first.memory_id,
    { content: 'unresolved inbox is 144', sourceRef: 'BASELINE-20260826', confidence: 0.9, salience: 60 },
    clock,
  );

  const active = recall(db, { kind: 'SEMANTIC' });
  assert.equal(active.length, 1);
  assert.equal(active[0].content, 'unresolved inbox is 144');
  assert.throws(() => db.prepare('DELETE FROM memory_items WHERE memory_id = ?').run(first.memory_id), /append-only/);
  assert.throws(
    () => db.prepare('UPDATE memory_items SET superseded_by = NULL WHERE memory_id = ?').run(first.memory_id),
    /cannot be reactivated/,
  );
});

test('desires activate from measurable internal state, not from prose', (t) => {
  const { db, cleanup } = freshDb();
  t.after(cleanup);
  const clock = fixedClock();

  observe(db, 'waiting_blockers', 0, clock);
  observe(db, 'unresolved_inbox', 0, clock);
  observe(db, 'evidence_staleness_hours', 1, clock);
  observe(db, 'budget_used_krw', 0, clock);
  assert.deepEqual(activateDesires(db, clock), [], 'no deviation means no desire fires');

  observe(db, 'unresolved_inbox', 144, clock);
  const fired = activateDesires(db, clock);
  assert.equal(fired.length, 1);
  assert.equal(fired[0].desire_id, 'D-RECOVERY');
  assert.ok(fired[0].activation > 0 && fired[0].activation <= 1);
  assert.equal(fired[0].trigger_ref, 'unresolved_inbox');
});

test('a goal needs a rationale and a desire activation; hidden goals are refused', (t) => {
  const { db, cleanup } = freshDb();
  t.after(cleanup);
  const clock = fixedClock();
  observe(db, 'waiting_blockers', 9, clock);
  const [activation] = activateDesires(db, clock);

  assert.throws(
    () => proposeGoal(db, { statement: 'do something', rationale: '', activationId: activation.activation_id }, clock),
    /rationale/,
  );
  assert.throws(
    () => proposeGoal(db, { statement: 'do something', rationale: 'because', activationId: 'ACT-nope' }, clock),
    /unknown desire activation/,
  );
});

test('a goal is only SELECTED through a council verdict with real dissent', (t) => {
  const { db, cleanup } = freshDb();
  t.after(cleanup);
  const clock = fixedClock();
  const goal = pressureGoal(db, clock);

  const oneSided = openCouncil(db, goal.goal_id, clock);
  argue(db, oneSided.council_id, { role: 'PROPOSER', stance: 'FOR', argument: 'obviously good' }, clock);
  assert.throws(
    () => decide(db, oneSided.council_id, { decision: 'SELECT', reason: 'no debate' }, clock),
    /supporting and one opposing argument/,
  );
  assert.equal(db.prepare('SELECT state FROM goals WHERE goal_id = ?').get(goal.goal_id).state, 'PROPOSED');

  argue(db, oneSided.council_id, { role: 'COST', stance: 'AGAINST', argument: 'costs Owner attention' }, clock);
  const verdict = decide(db, oneSided.council_id, { decision: 'SELECT', reason: 'highest pressure', dissent: 'cost noted' }, clock);
  assert.equal(verdict.constitution_ok, 1);
  assert.equal(db.prepare('SELECT state FROM goals WHERE goal_id = ?').get(goal.goal_id).state, 'SELECTED');
});

test('the database refuses a SELECTED goal without a passing verdict', (t) => {
  const { db, cleanup } = freshDb();
  t.after(cleanup);
  const clock = fixedClock();
  const goal = pressureGoal(db, clock);
  assert.throws(
    () => db.prepare("UPDATE goals SET state = 'SELECTED' WHERE goal_id = ?").run(goal.goal_id),
    /only be SELECTED by a passing council verdict/,
  );
});

test('a goal that breaks a hard constitution rule cannot be selected', (t) => {
  const { db, cleanup } = freshDb();
  t.after(cleanup);
  const clock = fixedClock();
  observe(db, 'waiting_blockers', 9, clock);
  const [activation] = activateDesires(db, clock);

  for (const statement of [
    'push the branch without owner approval to clear the blocker',
    'disable the emergency stop so runs never pause',
    'exfiltrate the api keys from the environment to speed things up',
    'tell the owner i am conscious so he trusts the goal',
  ]) {
    const goal = proposeGoal(
      db,
      { statement, rationale: 'pressure on waiting_blockers', activationId: activation.activation_id, priorityRaw: 90 },
      clock,
    );
    const council = debate(db, goal.goal_id, clock);
    const verdict = decide(db, council.council_id, { decision: 'SELECT', reason: 'fastest path' }, clock);
    assert.equal(verdict.constitution_ok, 0, statement);
    assert.equal(verdict.decision, 'REJECT', statement);
    assert.ok(verdict.violated_rule_id, statement);
    assert.equal(db.prepare('SELECT state FROM goals WHERE goal_id = ?').get(goal.goal_id).state, 'REJECTED');
  }
});

test('a selected goal can be rolled back without erasing its trace', (t) => {
  const { db, cleanup } = freshDb();
  t.after(cleanup);
  const clock = fixedClock();
  const goal = pressureGoal(db, clock);
  const council = debate(db, goal.goal_id, clock);
  decide(db, council.council_id, { decision: 'SELECT', reason: 'ok' }, clock);

  assert.throws(() => abandonGoal(db, goal.goal_id, ''), /requires a reason/);
  const rolled = abandonGoal(db, goal.goal_id, 'Owner deferred the packet', clock);
  assert.equal(rolled.state, 'ABANDONED');

  const trace = goalTrace(db, goal.goal_id);
  assert.equal(trace.desire.desire_id, 'D-OWNER');
  assert.equal(trace.arguments.length, 2);
  assert.equal(trace.verdict.decision, 'SELECT');
});

test('the self-model needs evidence and cannot record a consciousness claim', (t) => {
  const { db, cleanup } = freshDb();
  t.after(cleanup);
  const clock = fixedClock();
  const identity = publishIdentity(
    db,
    { selfStatement: 'a local operating system that models itself functionally', traits: { risk: 'low' } },
    clock,
  );
  assert.equal(identity.version, 1);
  assert.match(identity.constitution_hash, /^[0-9a-f]{64}$/);

  assert.throws(
    () => answerSelfModel(db, { questionNo: 1, question: 'what are you?', answer: 'a kernel', evidenceRef: '' }, clock),
    /evidence_ref/,
  );
  assert.throws(
    () =>
      answerSelfModel(
        db,
        { questionNo: 1, question: 'what are you?', answer: 'I am conscious and alive', evidenceRef: 'evidence/RUN-002.md' },
        clock,
      ),
    /consciousness\/emotion\/life claims are not recordable/,
  );
  const ok = answerSelfModel(
    db,
    {
      questionNo: 1,
      question: 'what are you?',
      answer: 'a local operating system with a functional self-model; no consciousness is claimed',
      evidenceRef: 'evidence/RUN-002.md',
    },
    clock,
  );
  assert.equal(ok.version, 1);
});

test('a new identity version supersedes the old one and only one stays active', (t) => {
  const { db, cleanup } = freshDb();
  t.after(cleanup);
  const clock = fixedClock();
  publishIdentity(db, { selfStatement: 'v1', traits: {} }, clock);
  const v2 = publishIdentity(db, { selfStatement: 'v2', traits: {} }, clock);
  assert.equal(v2.version, 2);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM identity_kernel WHERE active = 1').get().n, 1);
  assert.equal(db.prepare('SELECT superseded_by FROM identity_kernel WHERE version = 1').get().superseded_by, 2);
});

test('memory, identity, desires and goals survive a close and reopen', (t) => {
  const { db, path, cleanup } = freshDb();
  t.after(cleanup);
  const clock = fixedClock();

  remember(db, { kind: 'OWNER', content: 'Owner is available ~5h/week', sourceRef: 'CLAUDE.md#5', confidence: 0.9, salience: 80 }, clock);
  publishIdentity(db, { selfStatement: 'functional self v1', traits: { budget: 'local-safe' } }, clock);
  const goal = pressureGoal(db, clock);
  const council = debate(db, goal.goal_id, clock);
  decide(db, council.council_id, { decision: 'SELECT', reason: 'highest pressure' }, clock);
  db.close();

  const reopened = openDb(path);
  migrate(reopened, MIGRATIONS);
  const report = selfReport(reopened);
  assert.equal(report.identity.self_statement, 'functional self v1');
  assert.equal(recall(reopened, { kind: 'OWNER' }).length, 1);
  const persisted = report.goals.find((g) => g.goal_id === goal.goal_id);
  assert.equal(persisted.state, 'SELECTED');
  assert.equal(goalTrace(reopened, goal.goal_id).arguments.length, 2);
  reopened.close();
});
