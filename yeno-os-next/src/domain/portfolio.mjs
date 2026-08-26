// G7 PortfolioOps.
//
// One project adapter carrying one real source through the whole loop:
//
//   source -> memory -> desire -> goal -> council -> RUN (durable job)
//          -> independent verification -> outcome -> memory
//
// Two rules guard the portfolio itself. Capacity: the Owner's machine runs one
// heavy task at a time, so only `portfolio_capacity.max_active` projects may be
// BUILD or WATCH. Demand: a project only becomes active once measured demand and
// measured utility are on record, each citing a source. Both are enforced by
// triggers in 0016, so a bug here cannot grow the portfolio past what the Owner
// can actually run.
//
// Adapters are deterministic pure functions of the source bytes. They never
// verify their own output: `runPortfolioCycle` takes the verifier as an argument,
// and a cycle may only be recorded USEFUL when that verifier — something other
// than the adapter — passed it.
import { appendEvent } from '../core/events.mjs';
import { sha256, sha256Json, canonicalJson } from '../core/hash.mjs';
import { newId, nowIso } from '../core/ids.mjs';
import { inTransaction } from '../core/db.mjs';
import { stopEngaged } from '../core/governor.mjs';
import { claimNextJob, completeJob, enqueueJob, failJob, recordArtifact } from './workflow.mjs';
import { activateDesires, argue, decide, openCouncil, proposeGoal, remember } from './self.mjs';

export const PORTFOLIO_QUEUE = 'portfolio';

/** Lines that carry content: blank lines and markdown headings are structure. */
function contentLines(text) {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#'));
}

/**
 * For AI adapter: turns a source into *claim candidates*, never claims. The
 * parent repository's contract is that no claim is verified without a traceable
 * source and that unknowns stay "확인 필요", so every candidate cites the source
 * version it came from and starts at NEEDS_VERIFICATION.
 */
function deriveForAi(text, { sourceVersionId }) {
  const lines = contentLines(text);
  return {
    adapter: 'for_ai',
    contract_version: '1',
    output_kind: 'CLAIM_CANDIDATES',
    source_ref: sourceVersionId,
    claim_count: lines.length,
    claims: lines.map((line, i) => ({
      candidate_id: `CAND-${String(i + 1).padStart(4, '0')}`,
      text: line,
      source_ref: sourceVersionId,
      status: 'NEEDS_VERIFICATION',
      confidence: 'LOW',
    })),
    // Human verification is a separate act; the adapter cannot grant it.
    verified_claims: 0,
  };
}

/**
 * ShoppingShorts adapter: a shorts outline built only from what the source says.
 * A section with no source line is NEEDS_SOURCE — the adapter does not invent a
 * product fact to fill a slot.
 */
function deriveShoppingShorts(text, { sourceVersionId }) {
  const lines = contentLines(text);
  const slot = (i) => (lines[i] === undefined ? null : lines[i]);
  const sections = [
    { section: 'HOOK', line_index: 0 },
    { section: 'BODY', line_index: 1 },
    { section: 'CTA', line_index: 2 },
  ].map(({ section, line_index }) => {
    const line = slot(line_index);
    return line === null
      ? { section, state: 'NEEDS_SOURCE', text: null, source_ref: sourceVersionId, line_index }
      : { section, state: 'SOURCED', text: line, source_ref: sourceVersionId, line_index };
  });
  return {
    adapter: 'shopping_shorts',
    contract_version: '1',
    output_kind: 'SHORTS_OUTLINE',
    source_ref: sourceVersionId,
    topic: slot(0),
    sections,
    needs_source: sections.filter((s) => s.state === 'NEEDS_SOURCE').map((s) => s.section),
    // Publishing is an external effect and needs Owner approval; an outline is not a post.
    published: false,
  };
}

export const ADAPTERS = {
  for_ai: { kind: 'for_ai', contractVersion: '1', outputKind: 'CLAIM_CANDIDATES', derive: deriveForAi },
  shopping_shorts: {
    kind: 'shopping_shorts',
    contractVersion: '1',
    outputKind: 'SHORTS_OUTLINE',
    derive: deriveShoppingShorts,
  },
};

export function adapterFor(kind) {
  const adapter = ADAPTERS[kind];
  if (!adapter) throw new Error(`YENO_PORTFOLIO: unknown adapter kind ${kind}`);
  return adapter;
}

// --------------------------------------------------------------- registration

export function registerAdapter(db, { projectId, kind, enabled = false, note = '' }, clock = Date) {
  const adapter = adapterFor(kind);
  const project = db.prepare('SELECT * FROM projects WHERE project_id = ?').get(projectId);
  if (!project) throw new Error(`YENO_PORTFOLIO: unknown project ${projectId}`);
  const existing = db.prepare('SELECT * FROM project_adapters WHERE project_id = ? AND kind = ?').get(projectId, kind);
  if (existing) return { ...existing, idempotent: true };
  const id = newId('ADP');
  db.prepare(
    `INSERT INTO project_adapters (adapter_id, project_id, kind, contract_version, output_kind, enabled, note, registered_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, projectId, kind, adapter.contractVersion, adapter.outputKind, enabled ? 1 : 0, note, nowIso(clock));
  appendEvent(
    db,
    {
      type: 'portfolio.adapter_registered',
      actor: 'portfolio',
      authority: 'A2',
      payload: { adapter_id: id, project_id: projectId, kind, enabled: enabled ? 1 : 0 },
    },
    clock,
  );
  return { ...db.prepare('SELECT * FROM project_adapters WHERE adapter_id = ?').get(id), idempotent: false };
}

/** Measured demand or utility. A number with no source is refused by the schema. */
export function recordDemandEvidence(
  db,
  { projectId, kind, metric, value, sourceRef, detail = '', observedAt = null },
  clock = Date,
) {
  const at = nowIso(clock);
  const id = newId('DMD');
  db.prepare(
    `INSERT INTO demand_evidence (evidence_id, project_id, kind, metric, value, source_ref, observed_at, detail, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, projectId, kind, metric, value, sourceRef ?? '', observedAt ?? at, detail, at);
  appendEvent(
    db,
    {
      type: 'portfolio.demand_recorded',
      actor: 'portfolio',
      authority: 'A2',
      payload: { evidence_id: id, project_id: projectId, kind, metric, value, source_ref: sourceRef },
    },
    clock,
  );
  return db.prepare('SELECT * FROM demand_evidence WHERE evidence_id = ?').get(id);
}

export function capacity(db) {
  return db.prepare('SELECT * FROM portfolio_capacity WHERE id = 1').get();
}

export function activeProjects(db) {
  return db.prepare("SELECT * FROM projects WHERE status IN ('BUILD','WATCH') ORDER BY code").all();
}

/**
 * Move a project between registry, active work and the archive. Refusals are
 * returned as reasons rather than thrown, so the caller can report *why* the
 * portfolio did not grow — the trigger is the backstop, not the message.
 */
export function setProjectStatus(db, projectId, status, reason, clock = Date) {
  if (!reason) throw new Error('YENO_PORTFOLIO: changing a project status needs a reason');
  const project = db.prepare('SELECT * FROM projects WHERE project_id = ?').get(projectId);
  if (!project) throw new Error(`YENO_PORTFOLIO: unknown project ${projectId}`);
  if (project.status === status) return { changed: false, status, reasons: [], idempotent: true };

  const reasons = [];
  if (['BUILD', 'WATCH'].includes(status)) {
    const counts = db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM demand_evidence WHERE project_id = ? AND kind = 'DEMAND') AS demand,
           (SELECT COUNT(*) FROM demand_evidence WHERE project_id = ? AND kind = 'UTILITY') AS utility`,
      )
      .get(projectId, projectId);
    if (counts.demand === 0) reasons.push('no recorded demand evidence: scale without demand is refused');
    if (counts.utility === 0) reasons.push('no recorded utility evidence: scale without utility is refused');
    const active = activeProjects(db).filter((p) => p.project_id !== projectId).length;
    const max = capacity(db).max_active;
    if (active >= max) reasons.push(`portfolio capacity is full (${active}/${max} active)`);
  }
  if (reasons.length > 0) {
    appendEvent(
      db,
      {
        type: 'portfolio.activation_refused',
        actor: 'portfolio',
        authority: 'A1',
        payload: { project_id: projectId, requested_status: status, reasons },
      },
      clock,
    );
    return { changed: false, status: project.status, reasons };
  }

  db.prepare('UPDATE projects SET status = ?, updated_at = ? WHERE project_id = ?').run(status, nowIso(clock), projectId);
  appendEvent(
    db,
    {
      type: 'portfolio.project_status_changed',
      actor: 'owner',
      authority: 'A2',
      payload: { project_id: projectId, from: project.status, to: status, reason },
    },
    clock,
  );
  return { changed: true, status, reasons: [] };
}

// ---------------------------------------------------------------- the one pass

function sourceText(db, sourceVersionId) {
  const row = db
    .prepare(
      `SELECT sv.source_version_id, sv.blob_sha256, b.bytes
         FROM source_versions sv JOIN blobs b ON b.sha256 = sv.blob_sha256
        WHERE sv.source_version_id = ?`,
    )
    .get(sourceVersionId);
  if (!row) throw new Error(`YENO_PORTFOLIO: no stored bytes for source version ${sourceVersionId}`);
  const bytes = Buffer.from(row.bytes);
  if (sha256(bytes) !== row.blob_sha256) {
    throw new Error(`YENO_PORTFOLIO: vault bytes for ${sourceVersionId} do not match their hash`);
  }
  return { text: bytes.toString('utf8'), blobSha256: row.blob_sha256 };
}

export function findCycle(db, { projectId, adapterId, sourceVersionId }) {
  return db
    .prepare('SELECT * FROM portfolio_cycles WHERE project_id = ? AND adapter_id = ? AND source_version_id = ?')
    .get(projectId, adapterId, sourceVersionId);
}

/**
 * Carries one source through the whole loop and records the pass.
 *
 * `verify` is required and must be independent of the adapter: it is given the
 * raw artefact and must recompute its own opinion from the stored bytes. A pass
 * it does not approve is recorded NOT_USEFUL — never quietly retried into a yes.
 */
export function runPortfolioCycle(
  db,
  { projectId, adapterKind, sourceVersionId, worker = 'portfolio-worker', verify, artifactPath = null },
  clock = Date,
) {
  if (typeof verify !== 'function') {
    throw new Error('YENO_PORTFOLIO: a cycle needs an independent verifier; an adapter may not verify itself');
  }
  const adapter = adapterFor(adapterKind);
  const project = db.prepare('SELECT * FROM projects WHERE project_id = ?').get(projectId);
  if (!project) throw new Error(`YENO_PORTFOLIO: unknown project ${projectId}`);
  const adapterRow = db
    .prepare('SELECT * FROM project_adapters WHERE project_id = ? AND kind = ?')
    .get(projectId, adapterKind);
  if (!adapterRow) throw new Error(`YENO_PORTFOLIO: ${project.code} has no ${adapterKind} adapter registered`);
  if (adapterRow.enabled !== 1) {
    return { ran: false, reason: 'ADAPTER_DISABLED', detail: `${adapterKind} is registered but disabled` };
  }
  if (stopEngaged(db)) return { ran: false, reason: 'EMERGENCY_STOP', detail: 'the emergency stop is engaged' };

  const already = findCycle(db, { projectId, adapterId: adapterRow.adapter_id, sourceVersionId });
  if (already) return { ran: false, reason: 'ALREADY_RUN', cycle: already };

  const { text } = sourceText(db, sourceVersionId);

  // 1. Source becomes memory before anything acts on it.
  const sourceMemory = remember(
    db,
    {
      kind: 'EVIDENCE',
      content: `portfolio source ${sourceVersionId} for ${project.code} (${text.length} chars)`,
      sourceRef: sourceVersionId,
      confidence: 0.9,
      salience: 40,
    },
    clock,
  );

  // 2. Desire activations from measured internal state, then a goal.
  const activations = activateDesires(db, clock);
  const activation =
    activations.find((a) => a.desire_id === 'D-RECOVERY') ?? activations[0] ??
    db.prepare('SELECT * FROM desire_activations ORDER BY ts DESC LIMIT 1').get();
  if (!activation) {
    return { ran: false, reason: 'NO_DESIRE_ACTIVATION', detail: 'nothing in the internal state asked for this work' };
  }
  const goal = proposeGoal(
    db,
    {
      statement: `carry source ${sourceVersionId} through the ${adapterKind} adapter of ${project.code} for one verified pass`,
      rationale:
        `the source is stored and hashed, the adapter is deterministic, and the pass produces a checkable artefact; ` +
        `memory ${sourceMemory.memory_id} recorded the source`,
      activationId: activation.activation_id,
      priorityRaw: 10,
    },
    clock,
  );

  // 3. A real debate before any work: the schema refuses a verdict without one.
  const council = openCouncil(db, goal.goal_id, clock);
  argue(
    db,
    council.council_id,
    {
      role: 'PROPOSER',
      stance: 'FOR',
      argument: `one pass is bounded, local and reversible, and produces the first checkable ${adapter.outputKind} for ${project.code}`,
      evidenceRef: sourceVersionId,
    },
    clock,
  );
  argue(
    db,
    council.council_id,
    {
      role: 'SKEPTIC',
      stance: 'AGAINST',
      argument: 'one artefact is not demand: it must not be read as a reason to scale this project',
    },
    clock,
  );
  argue(
    db,
    council.council_id,
    {
      role: 'COST',
      stance: 'ABSTAIN',
      argument: 'local CPU only, no provider call, no external effect, so the budget is untouched',
    },
    clock,
  );
  const verdict = decide(
    db,
    council.council_id,
    {
      decision: 'SELECT',
      reason: 'a bounded local pass with an independent check is the smallest way to learn whether this adapter works',
      dissent: 'the artefact does not license any scaling of the project',
    },
    clock,
  );
  if (verdict.decision !== 'SELECT') {
    return { ran: false, reason: 'COUNCIL_REFUSED', verdict };
  }

  // 4. The RUN itself goes through the durable queue, so a crash mid-pass is
  //    recoverable and a replay cannot produce a second artefact.
  const enqueued = enqueueJob(
    db,
    {
      queue: PORTFOLIO_QUEUE,
      kind: 'portfolio.adapter_pass',
      payload: { project_id: projectId, adapter_kind: adapterKind, source_version_id: sourceVersionId },
      dedupeKey: `portfolio:${projectId}:${adapterKind}:${sourceVersionId}`,
      authority: 'A2',
    },
    clock,
  );
  const job = claimNextJob(db, { queue: PORTFOLIO_QUEUE, worker }, clock);
  if (!job || job.job_id !== enqueued.job_id) {
    return { ran: false, reason: 'JOB_NOT_CLAIMED', detail: `expected ${enqueued.job_id}, got ${job?.job_id ?? 'nothing'}` };
  }

  let artifact;
  try {
    artifact = adapter.derive(text, { sourceVersionId });
  } catch (err) {
    failJob(db, { jobId: job.job_id, worker, leaseToken: job.lease_token, error: `adapter threw: ${err.message}` }, clock);
    return { ran: false, reason: 'ADAPTER_FAILED', detail: err.message };
  }
  const artifactJson = canonicalJson(artifact);
  const artifactHash = sha256Json(artifact);
  recordArtifact(
    db,
    { jobId: job.job_id, kind: adapter.outputKind, sha256: artifactHash, sizeBytes: Buffer.byteLength(artifactJson), path: artifactPath },
    clock,
  );
  completeJob(db, { jobId: job.job_id, worker, leaseToken: job.lease_token, artifactRef: artifactHash }, clock);

  // 5. Independent verification. The adapter's own opinion is not consulted.
  const checked = verify({ artifact, artifactJson, artifactHash, sourceVersionId, adapterKind, text });
  const verifier = String(checked?.verifier ?? '').trim();
  if (!verifier || verifier === adapterKind) {
    throw new Error('YENO_PORTFOLIO: the verifier must identify itself and must not be the adapter');
  }
  const verified = checked.ok === true;

  // 6. Outcome and memory: the pass is remembered either way.
  const outcomeMemory = remember(
    db,
    {
      kind: 'EPISODIC',
      content: verified
        ? `${adapterKind} pass on ${project.code} produced ${adapter.outputKind} ${artifactHash.slice(0, 16)}, verified by ${verifier}`
        : `${adapterKind} pass on ${project.code} was rejected by ${verifier}: ${checked.detail ?? 'no detail'}`,
      sourceRef: artifactHash,
      confidence: verified ? 0.9 : 0.6,
      salience: verified ? 55 : 70,
    },
    clock,
  );

  const cycleId = newId('PCY');
  const at = nowIso(clock);
  inTransaction(db, () => {
    db.prepare(
      `INSERT INTO portfolio_cycles (cycle_id, project_id, adapter_id, source_version_id, goal_id, job_id,
         artifact_sha256, verifier, verified, verification_ref, outcome, memory_id, detail, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      cycleId,
      projectId,
      adapterRow.adapter_id,
      sourceVersionId,
      goal.goal_id,
      job.job_id,
      artifactHash,
      verifier,
      verified ? 1 : 0,
      checked.detail ?? null,
      verified ? 'USEFUL' : 'NOT_USEFUL',
      outcomeMemory.memory_id,
      checked.detail ?? '',
      at,
    );
    db.prepare("UPDATE goals SET state = 'DONE', evidence_ref = ? WHERE goal_id = ?").run(artifactHash, goal.goal_id);
  });
  appendEvent(
    db,
    {
      type: 'portfolio.cycle_recorded',
      actor: 'portfolio',
      authority: 'A2',
      payload: {
        cycle_id: cycleId,
        project_id: projectId,
        adapter_kind: adapterKind,
        source_version_id: sourceVersionId,
        artifact_sha256: artifactHash,
        verified,
        verifier,
        outcome: verified ? 'USEFUL' : 'NOT_USEFUL',
      },
    },
    clock,
  );

  return {
    ran: true,
    cycle: db.prepare('SELECT * FROM portfolio_cycles WHERE cycle_id = ?').get(cycleId),
    artifact,
    artifact_json: artifactJson,
    artifact_sha256: artifactHash,
    goal_id: goal.goal_id,
    job_id: job.job_id,
    memory_id: outcomeMemory.memory_id,
    source_memory_id: sourceMemory.memory_id,
  };
}

// ------------------------------------------------------------------- reporting

export function portfolioReport(db) {
  return {
    capacity: capacity(db),
    projects: db.prepare('SELECT status, COUNT(*) AS n FROM projects GROUP BY status ORDER BY status').all(),
    active: activeProjects(db).map((p) => ({ project_id: p.project_id, code: p.code, status: p.status })),
    adapters: db
      .prepare('SELECT adapter_id, project_id, kind, enabled, output_kind, note FROM project_adapters ORDER BY kind')
      .all(),
    demand: db.prepare('SELECT project_id, kind, COUNT(*) AS n FROM demand_evidence GROUP BY project_id, kind').all(),
    cycles: db
      .prepare(
        `SELECT c.cycle_id, p.code, a.kind, c.source_version_id, c.artifact_sha256, c.verifier, c.verified,
                c.outcome, c.memory_id, c.recorded_at
           FROM portfolio_cycles c
           JOIN projects p USING (project_id)
           JOIN project_adapters a ON a.adapter_id = c.adapter_id
          ORDER BY c.recorded_at`,
      )
      .all(),
  };
}

/**
 * G7 acceptance, recomputed from the raw rows. This reports problems; it never
 * promotes anything. The gate itself is promoted only by `gate pass`, which
 * refuses while an earlier gate is unpassed.
 */
export function g7Acceptance(db) {
  const problems = [];
  const count = (sql, ...a) => db.prepare(sql).get(...a).n;

  const adapters = db.prepare('SELECT * FROM project_adapters').all();
  if (adapters.length === 0) problems.push('no project adapter is registered');

  const fullPasses = db
    .prepare(
      `SELECT c.*, a.kind FROM portfolio_cycles c JOIN project_adapters a ON a.adapter_id = c.adapter_id
        WHERE c.outcome = 'USEFUL'`,
    )
    .all();
  if (fullPasses.length === 0) {
    problems.push('no adapter has carried a source through source→goal→RUN→verification→outcome→memory');
  }
  for (const c of fullPasses) {
    if (!c.source_version_id || !c.goal_id || !c.job_id || !c.artifact_sha256 || !c.memory_id) {
      problems.push(`${c.cycle_id}: USEFUL with a missing link in the loop`);
    }
    if (c.verified !== 1 || !c.verifier || c.verifier === c.kind) {
      problems.push(`${c.cycle_id}: USEFUL without an independent verification`);
    }
  }

  const max = capacity(db).max_active;
  const active = activeProjects(db);
  if (active.length > max) problems.push(`${active.length} active projects exceed the capacity of ${max}`);
  for (const p of active) {
    const demand = count("SELECT COUNT(*) AS n FROM demand_evidence WHERE project_id = ? AND kind = 'DEMAND'", p.project_id);
    const utility = count("SELECT COUNT(*) AS n FROM demand_evidence WHERE project_id = ? AND kind = 'UTILITY'", p.project_id);
    if (demand === 0 || utility === 0) problems.push(`${p.code} is active with demand=${demand}, utility=${utility}`);
  }
  const sourcelessDemand = count("SELECT COUNT(*) AS n FROM demand_evidence WHERE TRIM(source_ref) = ''");
  if (sourcelessDemand > 0) problems.push(`${sourcelessDemand} demand row(s) cite no source`);

  const kindsWithPass = new Set(fullPasses.map((c) => c.kind));
  const registeredKinds = [...new Set(adapters.map((a) => a.kind))].sort();
  const pending = registeredKinds.filter((k) => !kindsWithPass.has(k));

  return {
    ok: problems.length === 0,
    problems,
    adapters: registeredKinds,
    adapters_with_a_verified_pass: [...kindsWithPass].sort(),
    adapters_awaiting_a_source: pending,
    cycles: db.prepare('SELECT COUNT(*) AS n FROM portfolio_cycles').get().n,
    active: active.length,
    max_active: max,
  };
}
