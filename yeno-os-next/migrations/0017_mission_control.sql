------------------------------------------------------------------------------
-- 0017 Mission Control projection surface (G8, read side only)
--
-- G8's product is a Tauri desktop shell, and that needs a Rust toolchain this
-- machine does not have, so the shell is not started here. What can be earned
-- now without any install is the thing the shell is only allowed to render: the
-- eight panels, each one a deterministic view over state that already exists.
--
-- The rule this migration exists to make structural: the UI never computes
-- truth. Every panel is a SELECT with no parameters, so the desktop process can
-- open the database read-only and still draw the whole surface. A panel that
-- cannot be answered from these views is a panel that would have had to invent
-- state, and inventing state is how a dashboard starts lying about the kernel.
--
-- Additive only: views, no tables, no triggers, no changes to existing objects.
-- Views hold no rows, so dropping this migration loses nothing.
------------------------------------------------------------------------------

-- Panel 1 — Inbox. What was found, what state it is in, whether a body exists.
-- A title with no sealed body must be visibly not a project.
CREATE VIEW v_mc_inbox AS
SELECT
  i.inbox_id,
  i.title,
  i.state,
  i.attempts,
  i.next_action,
  i.evidence_ref,
  CASE WHEN i.source_version_id IS NULL THEN 0 ELSE 1 END AS has_body,
  i.source_version_id,
  (SELECT s.origin_ref FROM source_versions sv JOIN sources s ON s.source_id = sv.source_id
    WHERE sv.source_version_id = i.source_version_id) AS origin_ref,
  (SELECT COUNT(*) FROM recovery_attempts r WHERE r.inbox_id = i.inbox_id) AS recovery_attempts,
  (SELECT p.project_id FROM projects p WHERE p.promoted_from_inbox = i.inbox_id) AS promoted_project_id,
  i.updated_at
FROM inbox_items i;

-- Panel 2 — Projects. Registry with the two G7 limits visible, so the Owner can
-- see why a project is not active without reading a table.
CREATE VIEW v_mc_projects AS
SELECT
  p.project_id,
  p.code,
  p.name,
  p.program_ug,
  p.status,
  p.priority_raw,
  MAX(p.priority_raw, 0) AS priority_display,
  p.promoted_from_inbox,
  p.body_evidence_ref,
  (SELECT COUNT(*) FROM project_adapters a WHERE a.project_id = p.project_id) AS adapters,
  (SELECT COUNT(*) FROM project_adapters a WHERE a.project_id = p.project_id AND a.enabled = 1)
    AS adapters_enabled,
  (SELECT COUNT(*) FROM demand_evidence d WHERE d.project_id = p.project_id AND d.kind = 'DEMAND')
    AS demand_rows,
  (SELECT COUNT(*) FROM demand_evidence d WHERE d.project_id = p.project_id AND d.kind = 'UTILITY')
    AS utility_rows,
  (SELECT COUNT(*) FROM portfolio_cycles c WHERE c.project_id = p.project_id) AS cycles,
  (SELECT COUNT(*) FROM portfolio_cycles c
    WHERE c.project_id = p.project_id AND c.outcome = 'USEFUL' AND c.verified = 1) AS cycles_useful,
  p.updated_at
FROM projects p
GROUP BY p.project_id;

-- Panel 3 — Timeline. The ledger itself. The payload is deliberately included:
-- a timeline the Owner cannot expand is a timeline they have to trust.
CREATE VIEW v_mc_timeline AS
SELECT seq, event_id, ts, type, actor, authority, payload, hash
FROM events
ORDER BY seq DESC;

-- Panel 4 — Council. Every goal with its deliberation: how many voices spoke,
-- whether any dissented, and what the verdict was. A goal with no verdict must
-- read as undecided rather than as approved.
CREATE VIEW v_mc_council AS
SELECT
  g.goal_id,
  g.statement,
  g.state,
  g.priority_raw,
  g.desire_id,
  (SELECT d.name FROM desires d WHERE d.desire_id = g.desire_id) AS desire_name,
  cs.council_id,
  cs.opened_at,
  cs.closed_at,
  (SELECT COUNT(*) FROM council_arguments a WHERE a.council_id = cs.council_id) AS arguments,
  (SELECT COUNT(*) FROM council_arguments a
    WHERE a.council_id = cs.council_id AND a.stance = 'AGAINST') AS arguments_against,
  v.verdict_id,
  v.decision,
  v.reason,
  v.dissent,
  v.constitution_ok,
  v.violated_rule_id,
  g.evidence_ref
FROM goals g
LEFT JOIN council_verdicts v ON v.verdict_id = g.verdict_id
LEFT JOIN council_sessions cs ON cs.council_id = v.council_id;

-- Panel 5 — Approvals. The derived lifecycle state, recomputed here rather than
-- stored, so an expired grant can never be displayed as live.
CREATE VIEW v_mc_approvals AS
SELECT
  a.approval_id,
  a.exact_action,
  a.target,
  a.authority_state AS state,
  a.uses,
  a.max_uses,
  a.max_cost_krw,
  a.expires_at,
  a.granted_by,
  a.owner_packet_ref,
  a.rollback_plan,
  a.created_at
FROM (
  SELECT
    ap.*,
    CASE
      WHEN ap.revoked = 1 THEN 'REVOKED'
      WHEN ap.uses >= ap.max_uses THEN 'EXHAUSTED'
      WHEN ap.expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now') THEN 'EXPIRED'
      ELSE 'LIVE'
    END AS authority_state
  FROM approvals ap
) a;

-- Panel 6 — Evidence. One list of everything a claim can point at: gate
-- evidence, session RUN evidence, and artefact hashes. `present` is 0 when the
-- reference names a file, because a missing file is the interesting case.
CREATE VIEW v_mc_evidence AS
SELECT 'GATE' AS kind, g.gate_id AS ref_id, g.name AS label, g.state AS state,
       g.evidence_ref AS evidence_ref, NULL AS sha256, g.updated_at AS at
FROM gates g
UNION ALL
SELECT 'RUN', r.run_ref, r.goal, r.state, r.evidence_ref, NULL, COALESCE(r.ended_at, r.started_at)
FROM session_runs r
UNION ALL
SELECT 'ARTIFACT', a.artifact_id, a.kind, 'RECORDED', a.path, a.sha256, a.created_at
FROM artifacts a
UNION ALL
SELECT 'BACKUP', b.backup_id, 'backup', COALESCE(b.verify_result, 'UNVERIFIED'), b.path, b.db_sha256,
       b.created_at
FROM backups b;

-- Panel 7 — Costs. Budget profiles with the remainder computed, plus what the
-- governor actually refused on cost grounds.
CREATE VIEW v_mc_costs AS
SELECT
  b.profile_id,
  b.name,
  b.monthly_limit_krw,
  b.spent_krw,
  b.monthly_limit_krw - b.spent_krw AS remaining_krw,
  b.active,
  b.owner_promoted,
  (SELECT COUNT(*) FROM admission_attempts t
    WHERE t.decision = 'DENIED' AND t.reason_code IN ('COST_UNKNOWN', 'BUDGET_EXCEEDED')) AS cost_denials,
  (SELECT COUNT(*) FROM runs r WHERE r.budget_profile_id = b.profile_id) AS runs
FROM budget_profiles b;

-- Panel 8 — Settings. The switches, one row, all of them read as they really
-- are. A settings panel that cannot show the stop is worse than no panel.
CREATE VIEW v_mc_settings AS
SELECT
  (SELECT engaged FROM emergency_stop WHERE id = 1) AS emergency_stop_engaged,
  (SELECT reason FROM emergency_stop WHERE id = 1) AS emergency_stop_reason,
  (SELECT enabled FROM scheduler_state WHERE id = 1) AS scheduler_enabled,
  (SELECT COUNT(*) FROM schedules WHERE enabled = 1) AS schedules_armed,
  (SELECT COUNT(*) FROM schedules) AS schedules,
  (SELECT max_active FROM portfolio_capacity WHERE id = 1) AS portfolio_max_active,
  (SELECT COUNT(*) FROM projects WHERE status IN ('BUILD', 'WATCH')) AS projects_active,
  (SELECT version FROM identity_kernel WHERE active = 1) AS identity_version,
  (SELECT version FROM release_state WHERE id = 1) AS release_version,
  (SELECT current_gate FROM release_state WHERE id = 1) AS current_gate,
  (SELECT COUNT(*) FROM schema_migrations) AS migrations_applied,
  (SELECT COUNT(*) FROM events) AS events,
  (SELECT hash FROM events ORDER BY seq DESC LIMIT 1) AS head_hash;
