-- Lock down anonymous write access.
--
-- Previously `topic_candidates` and `document_stats` carried anon policies with
-- `using (true) with check (true)`, allowing any unauthenticated caller to
-- UPDATE arbitrary rows (e.g. self-approve a candidate, or inflate/zero a
-- document's view/citation counters). All privileged writes now flow through
-- service-role API routes:
--   - candidate review/promote: /api/admin/* (admin-secret gated)
--   - counters: POST /api/documents/[slug]/view and /cite (service-role client)
--
-- Service-role connections bypass RLS, so anon write policies are no longer
-- needed. Public SELECT policies are intentionally kept so the site can read.
-- DROP ... IF EXISTS keeps this idempotent regardless of which prior schema
-- (schema-v3.sql or the incremental migrations) was applied.

-- topic_candidates: anon may only INSERT user-suggested topics (policy kept).
drop policy if exists topic_candidates_public_update on topic_candidates;

-- document_stats: counters are incremented server-side via service role only.
drop policy if exists document_stats_public_insert on document_stats;
drop policy if exists document_stats_public_update on document_stats;
