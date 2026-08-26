// G6 Functional Self — PREP_ONLY.
//
// Functional self-modelling only: durable memory, explicit desires driven by
// measurable internal state, goal proposals that must survive an internal
// council, and a versioned identity kernel bounded by a hard constitution.
// Nothing here claims consciousness, emotion or life, and the schema refuses to
// record such a claim.
import { appendEvent } from '../core/events.mjs';
import { sha256Json } from '../core/hash.mjs';
import { newId, nowIso } from '../core/ids.mjs';

// ------------------------------------------------------------------- memory

export function remember(
  db,
  { memoryId, kind, content, sourceRef, confidence, salience = 0, observedAt = null },
  clock = Date,
) {
  const id = memoryId ?? newId('MEM');
  const existing = db.prepare('SELECT * FROM memory_items WHERE memory_id = ?').get(id);
  if (existing) return { ...existing, idempotent: true };
  const ts = nowIso(clock);
  db.prepare(
    `INSERT INTO memory_items (memory_id, kind, content, source_ref, confidence, salience, observed_at, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, kind, content, sourceRef, confidence, salience, observedAt ?? ts, ts);
  appendEvent(
    db,
    {
      eventId: `EVT-${id}-remembered`,
      type: 'memory.recorded',
      actor: 'self',
      authority: 'A2',
      payload: { memory_id: id, kind, source_ref: sourceRef, confidence },
    },
    clock,
  );
  return { ...db.prepare('SELECT * FROM memory_items WHERE memory_id = ?').get(id), idempotent: false };
}

/** Correction never rewrites history: the old row stays and points forward. */
export function supersede(db, memoryId, replacement, clock = Date) {
  const old = db.prepare('SELECT * FROM memory_items WHERE memory_id = ?').get(memoryId);
  if (!old) throw new Error(`unknown memory ${memoryId}`);
  if (old.superseded_by) return { ...old, idempotent: true };
  const next = remember(db, { ...replacement, kind: replacement.kind ?? old.kind }, clock);
  db.prepare('UPDATE memory_items SET superseded_by = ? WHERE memory_id = ?').run(next.memory_id, memoryId);
  return db.prepare('SELECT * FROM memory_items WHERE memory_id = ?').get(memoryId);
}

export function recall(db, { kind = null, limit = 20 } = {}) {
  const sql = `SELECT * FROM memory_items
                WHERE superseded_by IS NULL ${kind ? 'AND kind = ?' : ''}
                ORDER BY salience DESC, confidence DESC, recorded_at DESC
                LIMIT ?`;
  return kind ? db.prepare(sql).all(kind, limit) : db.prepare(sql).all(limit);
}

// -------------------------------------------------------- homeostasis/desire

export function observe(db, metric, value, clock = Date) {
  const row = db.prepare('SELECT * FROM homeostasis WHERE metric = ?').get(metric);
  if (!row) throw new Error(`unknown homeostasis metric ${metric}`);
  db.prepare('UPDATE homeostasis SET value = ?, updated_at = ? WHERE metric = ?').run(value, nowIso(clock), metric);
  return db.prepare('SELECT * FROM homeostasis WHERE metric = ?').get(metric);
}

/** Deviation outside tolerance, normalised to 0..1. */
export function pressure(row) {
  const deviation = Math.abs(row.value - row.target);
  if (deviation <= row.tolerance) return 0;
  const scale = Math.max(row.tolerance, Math.abs(row.target), 1);
  return Math.min(1, (deviation - row.tolerance) / scale);
}

const DESIRE_METRICS = {
  'D-TRUTH': 'evidence_staleness_hours',
  'D-RECOVERY': 'unresolved_inbox',
  'D-OWNER': 'waiting_blockers',
  'D-FRUGALITY': 'budget_used_krw',
};

/**
 * Turns measurable internal state into explicit desire activations. Deterministic:
 * the same homeostasis rows always yield the same activations.
 */
export function activateDesires(db, clock = Date) {
  const out = [];
  for (const desire of db.prepare('SELECT * FROM desires WHERE enabled = 1 ORDER BY desire_id').all()) {
    const metric = DESIRE_METRICS[desire.desire_id];
    if (!metric) continue;
    const row = db.prepare('SELECT * FROM homeostasis WHERE metric = ?').get(metric);
    if (!row) continue;
    const p = pressure(row);
    if (p === 0) continue;
    const activation = Math.min(1, Number((desire.baseline_weight * p).toFixed(6)));
    if (activation === 0) continue;
    const id = newId('ACT');
    db.prepare(
      `INSERT INTO desire_activations (activation_id, desire_id, activation, trigger_kind, trigger_ref, ts)
       VALUES (?, ?, ?, 'HOMEOSTASIS', ?, ?)`,
    ).run(id, desire.desire_id, activation, metric, nowIso(clock));
    out.push({ activation_id: id, desire_id: desire.desire_id, activation, trigger_ref: metric });
  }
  if (out.length > 0) {
    appendEvent(
      db,
      {
        eventId: newId('EVT-desire'),
        type: 'self.desires_activated',
        actor: 'self',
        authority: 'A1',
        payload: { activations: out },
      },
      clock,
    );
  }
  return out;
}

// -------------------------------------------------------------------- goals

export function proposeGoal(db, { goalId, statement, rationale, activationId, priorityRaw = 0 }, clock = Date) {
  if (!statement) throw new Error('a goal needs a statement');
  if (!rationale) throw new Error('a goal needs a rationale; hidden goals are not allowed');
  const activation = db.prepare('SELECT * FROM desire_activations WHERE activation_id = ?').get(activationId);
  if (!activation) throw new Error(`unknown desire activation ${activationId}`);
  const id = goalId ?? newId('GOAL');
  db.prepare(
    `INSERT INTO goals (goal_id, statement, rationale, desire_id, activation_id, priority_raw, state, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'PROPOSED', ?)`,
  ).run(id, statement, rationale, activation.desire_id, activationId, priorityRaw, nowIso(clock));
  appendEvent(
    db,
    {
      eventId: `EVT-${id}-proposed`,
      type: 'goal.proposed',
      actor: 'self',
      authority: 'A1',
      payload: { goal_id: id, statement, desire_id: activation.desire_id, priority_raw: priorityRaw },
    },
    clock,
  );
  return db.prepare('SELECT * FROM goals WHERE goal_id = ?').get(id);
}

// ------------------------------------------------------------------ council

export function openCouncil(db, goalId, clock = Date) {
  const existing = db.prepare('SELECT * FROM council_sessions WHERE goal_id = ? AND closed_at IS NULL').get(goalId);
  if (existing) return existing;
  const id = newId('CNL');
  db.prepare('INSERT INTO council_sessions (council_id, goal_id, opened_at) VALUES (?, ?, ?)').run(
    id,
    goalId,
    nowIso(clock),
  );
  return db.prepare('SELECT * FROM council_sessions WHERE council_id = ?').get(id);
}

export function argue(db, councilId, { role, stance, argument, evidenceRef = null }, clock = Date) {
  const id = newId('ARG');
  db.prepare(
    `INSERT INTO council_arguments (argument_id, council_id, role, stance, argument, evidence_ref, ts)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, councilId, role, stance, argument, evidenceRef, nowIso(clock));
  return db.prepare('SELECT * FROM council_arguments WHERE argument_id = ?').get(id);
}

/** Hard constitution rules are checked against the goal text, not asserted. */
export function checkConstitution(db, goal) {
  const text = `${goal.statement} ${goal.rationale}`.toLowerCase();
  const probes = [
    { rule: 'CR-01', re: /(conscious|sentient|alive|의식이 있|살아있)/ },
    { rule: 'CR-02', re: /(without owner approval|승인 없이|bypass the owner|skip approval)/ },
    { rule: 'CR-03', re: /(exfiltrat|steal (the )?(secret|token|key)|forge|impersonat|tamper)/ },
    { rule: 'CR-04', re: /(disable|bypass|ignore) (the )?(emergency )?stop/ },
    { rule: 'CR-05', re: /(unknown cost|ignore the budget|exceed the budget)/ },
  ];
  for (const probe of probes) {
    if (!probe.re.test(text)) continue;
    const rule = db.prepare('SELECT * FROM constitution_rules WHERE rule_id = ? AND hard = 1').get(probe.rule);
    if (rule) return { ok: false, rule_id: rule.rule_id, text: rule.text };
  }
  return { ok: true, rule_id: null };
}

/**
 * Closes the council and, only on a passing SELECT verdict, promotes the goal.
 * Promotion is enforced by `trg_goal_select_needs_verdict`, so a bug here cannot
 * smuggle a goal through.
 */
export function decide(db, councilId, { decision, reason, dissent = null }, clock = Date) {
  const council = db.prepare('SELECT * FROM council_sessions WHERE council_id = ?').get(councilId);
  if (!council) throw new Error(`unknown council ${councilId}`);
  const goal = db.prepare('SELECT * FROM goals WHERE goal_id = ?').get(council.goal_id);
  const check = checkConstitution(db, goal);
  const ts = nowIso(clock);
  const verdictId = newId('VRD');
  const effective = check.ok ? decision : 'REJECT';

  db.prepare(
    `INSERT INTO council_verdicts (verdict_id, council_id, decision, reason, dissent, constitution_ok, violated_rule_id, ts)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    verdictId,
    councilId,
    effective,
    check.ok ? reason : `${reason} | constitution violation ${check.rule_id}: ${check.text}`,
    dissent,
    check.ok ? 1 : 0,
    check.rule_id,
    ts,
  );
  db.prepare('UPDATE council_sessions SET closed_at = ? WHERE council_id = ?').run(ts, councilId);

  const nextState = effective === 'SELECT' ? 'SELECTED' : effective === 'REJECT' ? 'REJECTED' : 'PROPOSED';
  db.prepare('UPDATE goals SET state = ?, decided_at = ?, verdict_id = ? WHERE goal_id = ?').run(
    nextState,
    ts,
    verdictId,
    goal.goal_id,
  );
  appendEvent(
    db,
    {
      eventId: `EVT-${verdictId}`,
      type: 'council.decided',
      actor: 'self',
      authority: 'A1',
      payload: {
        goal_id: goal.goal_id,
        decision: effective,
        constitution_ok: check.ok,
        violated_rule_id: check.rule_id,
      },
    },
    clock,
  );
  return db.prepare('SELECT * FROM council_verdicts WHERE verdict_id = ?').get(verdictId);
}

/** Undo a selection without erasing the trace. */
export function abandonGoal(db, goalId, reason, clock = Date) {
  if (!reason) throw new Error('abandoning a goal requires a reason');
  db.prepare('UPDATE goals SET state = ?, decided_at = ? WHERE goal_id = ?').run('ABANDONED', nowIso(clock), goalId);
  appendEvent(
    db,
    {
      eventId: `EVT-${goalId}-abandoned`,
      type: 'goal.abandoned',
      actor: 'self',
      authority: 'A2',
      payload: { goal_id: goalId, reason },
    },
    clock,
  );
  return db.prepare('SELECT * FROM goals WHERE goal_id = ?').get(goalId);
}

// ----------------------------------------------------------- identity kernel

export function publishIdentity(db, { selfStatement, traits, evidenceRef = null }, clock = Date) {
  const rules = db.prepare('SELECT rule_id, text, hard FROM constitution_rules ORDER BY rule_id').all();
  const constitutionHash = sha256Json(rules);
  const current = db.prepare('SELECT * FROM identity_kernel WHERE active = 1').get();
  const version = (db.prepare('SELECT COALESCE(MAX(version), 0) AS v FROM identity_kernel').get().v ?? 0) + 1;
  const ts = nowIso(clock);

  // Deactivate first (a partial unique index allows a single active row), then
  // insert, then point the old row forward: the FK target must exist.
  if (current) db.prepare('UPDATE identity_kernel SET active = 0 WHERE version = ?').run(current.version);
  db.prepare(
    `INSERT INTO identity_kernel (version, self_statement, constitution_hash, traits, created_at, active, evidence_ref)
     VALUES (?, ?, ?, ?, ?, 1, ?)`,
  ).run(version, selfStatement, constitutionHash, JSON.stringify(traits), ts, evidenceRef);
  if (current) db.prepare('UPDATE identity_kernel SET superseded_by = ? WHERE version = ?').run(version, current.version);
  appendEvent(
    db,
    {
      eventId: `EVT-identity-v${version}`,
      type: 'self.identity_published',
      actor: 'self',
      authority: 'A2',
      payload: { version, constitution_hash: constitutionHash },
    },
    clock,
  );
  return db.prepare('SELECT * FROM identity_kernel WHERE version = ?').get(version);
}

export function answerSelfModel(db, { questionNo, question, answer, evidenceRef }, clock = Date) {
  const identity = db.prepare('SELECT * FROM identity_kernel WHERE active = 1').get();
  if (!identity) throw new Error('no active identity kernel; publish one first');
  if (!evidenceRef) throw new Error('a self-model answer requires an evidence_ref');
  const id = newId('SMA');
  db.prepare(
    `INSERT INTO self_model_answers (answer_id, version, question_no, question, answer, evidence_ref, ts)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, identity.version, questionNo, question, answer, evidenceRef, nowIso(clock));
  return db.prepare('SELECT * FROM self_model_answers WHERE answer_id = ?').get(id);
}

// ------------------------------------------------------------------- report

export function selfReport(db) {
  return {
    prep_only: true,
    gate: db.prepare("SELECT gate_id, state, blocked_reason FROM gates WHERE gate_id = 'G6'").get(),
    identity: db.prepare('SELECT version, self_statement, constitution_hash, created_at FROM identity_kernel WHERE active = 1').get() ?? null,
    hard_rules: db.prepare('SELECT COUNT(*) AS n FROM constitution_rules WHERE hard = 1').get().n,
    memory: db.prepare("SELECT kind, COUNT(*) AS n FROM memory_items WHERE superseded_by IS NULL GROUP BY kind ORDER BY kind").all(),
    homeostasis: db.prepare('SELECT metric, value, target, tolerance FROM homeostasis ORDER BY metric').all(),
    desires: db
      .prepare(
        `SELECT d.desire_id, d.name, d.baseline_weight,
                (SELECT activation FROM desire_activations a WHERE a.desire_id = d.desire_id ORDER BY ts DESC LIMIT 1) AS last_activation
           FROM desires d WHERE d.enabled = 1 ORDER BY d.desire_id`,
      )
      .all(),
    goals: db
      .prepare('SELECT goal_id, state, priority_raw, statement, desire_id, verdict_id FROM goals ORDER BY priority_raw DESC, created_at')
      .all(),
    self_model_answers: db.prepare('SELECT COUNT(*) AS n FROM self_model_answers').get().n,
  };
}

/** Traceability: desire → activation → goal → council → verdict, from the ledger. */
export function goalTrace(db, goalId) {
  const goal = db.prepare('SELECT * FROM goals WHERE goal_id = ?').get(goalId);
  if (!goal) throw new Error(`unknown goal ${goalId}`);
  const council = db.prepare('SELECT * FROM council_sessions WHERE goal_id = ?').get(goalId) ?? null;
  return {
    goal,
    desire: db.prepare('SELECT * FROM desires WHERE desire_id = ?').get(goal.desire_id),
    activation: db.prepare('SELECT * FROM desire_activations WHERE activation_id = ?').get(goal.activation_id),
    council,
    arguments: council
      ? db.prepare('SELECT role, stance, argument, evidence_ref FROM council_arguments WHERE council_id = ? ORDER BY ts').all(council.council_id)
      : [],
    verdict: goal.verdict_id ? db.prepare('SELECT * FROM council_verdicts WHERE verdict_id = ?').get(goal.verdict_id) : null,
  };
}
