-- YENO Living OS — 0004_handoff_view.sql
-- v_handoff must only advertise NEXT_RUN entries a session can actually take:
-- entries waiting on an unresolved blocker are counted separately.

DROP VIEW v_handoff;

CREATE VIEW v_handoff AS
WITH takeable AS (
  SELECT n.* FROM next_run n
  LEFT JOIN blockers b ON b.blocker_id = n.blocked_by
  WHERE n.consumed_at IS NULL AND (b.blocker_id IS NULL OR b.state <> 'WAITING')
)
SELECT
  (SELECT current_gate FROM release_state WHERE id = 1)                              AS current_gate,
  (SELECT COUNT(*) FROM gates WHERE state = 'PASSED')                                AS gates_passed,
  (SELECT run_ref FROM session_runs ORDER BY started_at DESC LIMIT 1)                AS last_run_ref,
  (SELECT state FROM session_runs ORDER BY started_at DESC LIMIT 1)                  AS last_run_state,
  (SELECT COUNT(*) FROM session_runs WHERE state = 'IN_PROGRESS')                    AS runs_in_progress,
  (SELECT COUNT(*) FROM blockers WHERE state = 'WAITING')                            AS blockers_waiting,
  (SELECT COUNT(*) FROM takeable)                                                    AS next_run_takeable,
  (SELECT COUNT(*) FROM next_run n JOIN blockers b ON b.blocker_id = n.blocked_by
     WHERE n.consumed_at IS NULL AND b.state = 'WAITING')                            AS next_run_waiting,
  (SELECT exact_action FROM takeable ORDER BY priority DESC, created_at LIMIT 1)      AS next_exact_action;
