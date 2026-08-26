// G2 Unbounded Intake.
//
// Contract: raw bytes are sealed in the vault first, provenance is separate from
// content, and the same bytes from the same origin can be re-imported forever
// without forking state. A conversation title creates an unresolved inbox item —
// never a project. Leaving BODY_MISSING requires a recorded recovery attempt
// pointing at the source_version the body actually came from.
import { appendEvent } from '../core/events.mjs';
import { catchUp } from '../core/projections.mjs';
import { canonicalJson, sha256 } from '../core/hash.mjs';
import { newId, nowIso } from '../core/ids.mjs';
import { PARSERS, findParser } from './parsers.mjs';

const NEXT_ACTION = {
  BODY_MISSING: 'await official chat export body; promotion on the title alone is blocked',
  NEEDS_SOURCE: 'request the official export or an Owner statement for this title',
  PARTIAL: 'recover the remaining messages from the official export',
  RECOVERED: 'Owner review of the recovered body before project promotion',
  BLOCKED: 'unblock the named source candidate before another recovery attempt',
  PROMOTED: 'maintain the promoted project; keep the raw source sealed',
  DISABLED: 'keep archived; no recovery work scheduled',
};

/** Registers the built-in parser registry. Idempotent. */
export function registerParsers(db, clock = Date) {
  const at = nowIso(clock);
  const stmt = db.prepare(
    `INSERT INTO parsers (parser_id, kind, version, media_types, yields_body, active, registered_at)
     VALUES (?, ?, ?, ?, ?, 1, ?)
     ON CONFLICT(parser_id) DO NOTHING`,
  );
  for (const p of PARSERS) {
    stmt.run(p.parserId, p.kind, p.version, canonicalJson(p.mediaTypes), p.yieldsBody ? 1 : 0, at);
  }
  return db.prepare('SELECT parser_id, kind, version, yields_body, active FROM parsers ORDER BY parser_id').all();
}

function transact(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function inboxIdFor(externalId) {
  return `INBOX-${sha256(externalId).slice(0, 24)}`;
}

function setState(db, item, state, patch, clock) {
  const at = nowIso(clock);
  const attempts = patch.attempts ?? item.attempts;
  db.prepare(
    `UPDATE inbox_items SET state = ?, attempts = ?, last_attempt_at = ?, next_action = ?,
       source_version_id = COALESCE(?, source_version_id), evidence_ref = COALESCE(?, evidence_ref), updated_at = ?
     WHERE inbox_id = ?`,
  ).run(
    state,
    attempts,
    at,
    NEXT_ACTION[state],
    patch.sourceVersionId ?? null,
    patch.evidenceRef ?? null,
    at,
    item.inbox_id,
  );
  appendEvent(
    db,
    {
      type: 'inbox.state_changed',
      actor: patch.actor ?? 'intake',
      authority: 'A2',
      payload: { inbox_id: item.inbox_id, state, attempts, from: item.state },
    },
    clock,
  );
}

/**
 * Ingests one input. `bytes` may be a Buffer or a string; `kind` is the origin
 * kind, not the parser. Re-ingesting identical bytes from the same origin with
 * the same parser records a DUPLICATE and changes nothing else.
 */
export function ingest(db, { bytes, kind, originRef, parserId, note = null, actor = 'intake' }, clock = Date) {
  const parser = findParser(parserId);
  if (!parser) throw new Error(`unknown parser ${parserId}`);
  if (parser.kind === 'CHAT_EXPORT' && kind !== 'CHAT_EXPORT') {
    throw new Error(`parser ${parserId} only parses CHAT_EXPORT origins, got ${kind}`);
  }
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(String(bytes), 'utf8');
  const blob = sha256(buf);
  const at = nowIso(clock);

  return transact(db, () => {
    db.prepare('INSERT INTO blobs (sha256, size_bytes, bytes, created_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING')
      .run(blob, buf.length, buf, at);

    let source = db.prepare('SELECT * FROM sources WHERE kind = ? AND origin_ref = ?').get(kind, originRef);
    if (!source) {
      const sourceId = newId('SRC');
      db.prepare('INSERT INTO sources (source_id, kind, origin_ref, created_at) VALUES (?, ?, ?, ?)')
        .run(sourceId, kind, originRef, at);
      source = db.prepare('SELECT * FROM sources WHERE source_id = ?').get(sourceId);
    }

    const provenance = canonicalJson({ origin_ref: originRef, kind, note, size_bytes: buf.length });
    const existing = db
      .prepare(
        `SELECT * FROM source_versions
          WHERE source_id = ? AND blob_sha256 = ? AND provenance_json = ? AND parser_version = ?`,
      )
      .get(source.source_id, blob, provenance, parser.parserId);

    if (existing) {
      const intakeId = newId('INTK');
      db.prepare(
        `INSERT INTO intakes (intake_id, parser_id, source_id, source_version_id, origin_ref, blob_sha256,
           size_bytes, outcome, reason, titles_seen, bodies_recovered, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'DUPLICATE', ?, 0, 0, ?)`,
      ).run(
        intakeId,
        parser.parserId,
        source.source_id,
        existing.source_version_id,
        originRef,
        blob,
        buf.length,
        'identical bytes, origin and parser already ingested',
        at,
      );
      return {
        intake_id: intakeId,
        outcome: 'DUPLICATE',
        source_version_id: existing.source_version_id,
        titles_seen: 0,
        bodies_recovered: 0,
        new_items: 0,
      };
    }

    let records;
    try {
      records = parser.parse(buf.toString('utf8'));
    } catch (err) {
      const intakeId = newId('INTK');
      db.prepare(
        `INSERT INTO intakes (intake_id, parser_id, source_id, source_version_id, origin_ref, blob_sha256,
           size_bytes, outcome, reason, titles_seen, bodies_recovered, created_at)
         VALUES (?, ?, ?, NULL, ?, ?, ?, 'REJECTED', ?, 0, 0, ?)`,
      ).run(intakeId, parser.parserId, source.source_id, originRef, blob, buf.length, `parse failed: ${err.message}`, at);
      return { intake_id: intakeId, outcome: 'REJECTED', reason: err.message, titles_seen: 0, bodies_recovered: 0, new_items: 0 };
    }

    const bodiesInInput = records.filter((r) => r.messages.length > 0).length;
    const sourceVersionId = newId('SV');
    db.prepare(
      `INSERT INTO source_versions (source_version_id, source_id, blob_sha256, parser_version, provenance_json,
         fetched_at, confidence)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      sourceVersionId,
      source.source_id,
      blob,
      parser.parserId,
      provenance,
      at,
      bodiesInInput > 0 ? 'PARSED' : 'RAW',
    );

    let newItems = 0;
    let recovered = 0;
    for (const record of records) {
      if (record.title === '') continue;
      const inboxId = inboxIdFor(record.external_id);
      let item = db.prepare('SELECT * FROM inbox_items WHERE inbox_id = ?').get(inboxId);
      if (!item) {
        db.prepare(
          `INSERT INTO inbox_items (inbox_id, title, source_version_id, state, attempts, last_attempt_at,
             next_action, evidence_ref, created_at, updated_at)
           VALUES (?, ?, NULL, 'BODY_MISSING', 0, NULL, ?, NULL, ?, ?)`,
        ).run(inboxId, record.title, NEXT_ACTION.BODY_MISSING, at, at);
        appendEvent(
          db,
          {
            type: 'inbox.recorded',
            actor,
            authority: 'A2',
            payload: { inbox_id: inboxId, title: record.title, state: 'BODY_MISSING', attempts: 0 },
          },
          clock,
        );
        newItems += 1;
        item = db.prepare('SELECT * FROM inbox_items WHERE inbox_id = ?').get(inboxId);
      }

      if (record.external_id.startsWith('TSP-') || /^(SCG|RSP|PCR|UP|UG|X)-/.test(record.external_id)) {
        const [idKind] = record.external_id.split('-');
        db.prepare(
          `INSERT INTO id_crosswalk (id_kind, external_id, source_version_id, inbox_id, project_id, note, created_at)
           VALUES (?, ?, ?, ?, NULL, ?, ?) ON CONFLICT DO NOTHING`,
        ).run(idKind, record.external_id, sourceVersionId, inboxId, `seen by ${parser.parserId}`, at);
      }

      if (record.messages.length === 0) continue;
      if (item.state === 'PROMOTED' || item.state === 'DISABLED') continue;

      const outcome = record.messages.length >= 2 ? 'RECOVERED' : 'PARTIAL';
      db.prepare(
        `INSERT INTO recovery_attempts (attempt_id, inbox_id, method, outcome, source_version_id, evidence_ref,
           detail, created_at)
         VALUES (?, ?, 'OFFICIAL_EXPORT', ?, ?, ?, ?, ?)`,
      ).run(
        newId('RECA'),
        inboxId,
        outcome,
        sourceVersionId,
        originRef,
        `${record.messages.length} messages parsed by ${parser.parserId}`,
        at,
      );
      setState(
        db,
        item,
        outcome,
        { attempts: item.attempts + 1, sourceVersionId, evidenceRef: originRef, actor },
        clock,
      );
      recovered += 1;
    }

    const intakeId = newId('INTK');
    db.prepare(
      `INSERT INTO intakes (intake_id, parser_id, source_id, source_version_id, origin_ref, blob_sha256,
         size_bytes, outcome, reason, titles_seen, bodies_recovered, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'ACCEPTED', NULL, ?, ?, ?)`,
    ).run(
      intakeId,
      parser.parserId,
      source.source_id,
      sourceVersionId,
      originRef,
      blob,
      buf.length,
      records.length,
      recovered,
      at,
    );
    appendEvent(
      db,
      {
        type: 'intake.recorded',
        actor,
        authority: 'A2',
        payload: {
          intake_id: intakeId,
          source_version_id: sourceVersionId,
          parser_id: parser.parserId,
          blob_sha256: blob,
          titles_seen: records.length,
          bodies_recovered: recovered,
        },
      },
      clock,
    );

    return {
      intake_id: intakeId,
      outcome: 'ACCEPTED',
      source_version_id: sourceVersionId,
      titles_seen: records.length,
      bodies_recovered: recovered,
      new_items: newItems,
    };
  });
}

/** Records a recovery attempt that did not come from a parsed export. */
export function recordRecoveryAttempt(
  db,
  inboxId,
  { method, outcome, sourceVersionId = null, evidenceRef = null, detail },
  clock = Date,
) {
  const item = db.prepare('SELECT * FROM inbox_items WHERE inbox_id = ?').get(inboxId);
  if (!item) throw new Error(`unknown inbox item ${inboxId}`);
  const at = nowIso(clock);
  return transact(db, () => {
    const attemptId = newId('RECA');
    db.prepare(
      `INSERT INTO recovery_attempts (attempt_id, inbox_id, method, outcome, source_version_id, evidence_ref,
         detail, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(attemptId, inboxId, method, outcome, sourceVersionId, evidenceRef, detail, at);

    const nextState = {
      RECOVERED: 'RECOVERED',
      PARTIAL: 'PARTIAL',
      NOT_FOUND: 'NEEDS_SOURCE',
      BLOCKED: 'BLOCKED',
      REFUSED: 'BLOCKED',
    }[outcome];
    setState(db, item, nextState, { attempts: item.attempts + 1, sourceVersionId, evidenceRef }, clock);
    return { attempt_id: attemptId, inbox_id: inboxId, state: nextState, attempts: item.attempts + 1 };
  });
}

/**
 * Promotes an inbox item to a project. Refuses title-only promotion in the
 * domain as well as in the schema: a body with provenance, or an explicit Owner
 * confirmation, is required.
 */
export function promoteInbox(
  db,
  inboxId,
  { code, name, status = 'REGISTRY', bodyEvidenceRef = null, ownerConfirmationRef = null, programUg = null },
  clock = Date,
) {
  const item = db.prepare('SELECT * FROM inbox_items WHERE inbox_id = ?').get(inboxId);
  if (!item) throw new Error(`unknown inbox item ${inboxId}`);
  const reasons = [];
  const hasBody = item.source_version_id !== null && ['RECOVERED', 'PARTIAL'].includes(item.state);
  if (!hasBody && ownerConfirmationRef === null) {
    reasons.push(`title-only promotion refused: ${inboxId} is ${item.state} with no Owner confirmation`);
  }
  if (hasBody && bodyEvidenceRef === null && ownerConfirmationRef === null) {
    reasons.push('promotion needs a body evidence ref or an Owner confirmation ref');
  }
  if (reasons.length > 0) return { promoted: false, reasons };

  const at = nowIso(clock);
  return transact(db, () => {
    const projectId = newId('PRJ');
    db.prepare(
      `INSERT INTO projects (project_id, code, name, program_ug, status, priority_raw, promoted_from_inbox,
         body_evidence_ref, owner_confirmation_ref, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
    ).run(projectId, code, name, programUg, status, inboxId, bodyEvidenceRef, ownerConfirmationRef, at, at);
    setState(db, item, 'PROMOTED', { attempts: item.attempts, evidenceRef: bodyEvidenceRef ?? ownerConfirmationRef }, clock);
    appendEvent(
      db,
      {
        type: 'project.promoted',
        actor: 'intake',
        authority: 'A2',
        payload: { project_id: projectId, code, inbox_id: inboxId, body_evidence_ref: bodyEvidenceRef, owner_confirmation_ref: ownerConfirmationRef },
      },
      clock,
    );
    return { promoted: true, project_id: projectId, code, reasons: [] };
  });
}

/** Records the outcome of probing a named source candidate. Never guesses content. */
export function recordCandidateProbe(db, candidateId, { state, evidenceRef = null, detail = '' }, clock = Date) {
  const at = nowIso(clock);
  const row = db.prepare('SELECT * FROM source_candidates WHERE candidate_id = ?').get(candidateId);
  if (!row) throw new Error(`unknown source candidate ${candidateId}`);
  db.prepare('UPDATE source_candidates SET state = ?, last_checked_at = ?, evidence_ref = ? WHERE candidate_id = ?')
    .run(state, at, evidenceRef, candidateId);
  appendEvent(
    db,
    {
      type: 'candidate.probed',
      actor: 'intake',
      authority: 'A1',
      payload: { candidate_id: candidateId, state, evidence_ref: evidenceRef, detail },
    },
    clock,
  );
  return db.prepare('SELECT * FROM source_candidates WHERE candidate_id = ?').get(candidateId);
}

/**
 * The coverage invariant: every discovered source has a state and a next action,
 * nothing claims a body it cannot show, and no project came from a title alone.
 */
export function intakeCoverage(db) {
  const inv = db.prepare('SELECT * FROM v_intake_invariant').get();
  const problems = [];
  if (inv.items_without_next_action > 0) {
    problems.push(`${inv.items_without_next_action} inbox items have no next action`);
  }
  if (inv.recovered_without_bytes > 0) {
    problems.push(`${inv.recovered_without_bytes} items claim a recovered body without provenance`);
  }
  if (inv.title_only_projects > 0) problems.push(`${inv.title_only_projects} projects were promoted from a title alone`);
  if (inv.active_parsers === 0) problems.push('no active parser is registered');

  const unstated = db
    .prepare(
      `SELECT COUNT(*) AS n FROM inbox_items
        WHERE state IN ('RECOVERED','PARTIAL')
          AND NOT EXISTS (SELECT 1 FROM recovery_attempts a WHERE a.inbox_id = inbox_items.inbox_id)`,
    )
    .get().n;
  if (unstated > 0) problems.push(`${unstated} recovered items have no recorded recovery attempt`);

  return { ok: problems.length === 0, invariant: inv, problems };
}

export function intakeReport(db) {
  const coverage = intakeCoverage(db);
  return {
    generated_at: new Date().toISOString(),
    ok: coverage.ok,
    problems: coverage.problems,
    invariant: coverage.invariant,
    parsers: db.prepare('SELECT parser_id, kind, version, yields_body, active FROM parsers ORDER BY parser_id').all(),
    states: db.prepare('SELECT state, COUNT(*) AS items FROM inbox_items GROUP BY state ORDER BY state').all(),
    candidates: db.prepare('SELECT candidate_id, url, state, last_checked_at FROM source_candidates ORDER BY candidate_id').all(),
    recent_intakes: db
      .prepare(
        `SELECT intake_id, parser_id, outcome, titles_seen, bodies_recovered, reason, created_at
           FROM intakes ORDER BY created_at DESC, intake_id DESC LIMIT 10`,
      )
      .all(),
  };
}

/** Items still waiting on a body, in the order recovery work should be attempted. */
export function recoveryQueue(db, limit = 20) {
  return db
    .prepare(
      `SELECT inbox_id, title, state, attempts, attempts_recorded, last_outcome, next_action
         FROM v_recovery_ledger
        WHERE state IN ('BODY_MISSING','NEEDS_SOURCE','PARTIAL','BLOCKED')
        ORDER BY attempts, title LIMIT ?`,
    )
    .all(limit);
}

export function syncIntakeProjections(db, clock = Date) {
  return catchUp(db, clock);
}
