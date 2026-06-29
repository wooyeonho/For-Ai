-- Harden public submission and review-queue RLS.
--
-- Security requirements:
--   - public submissions are insert-only and must enter the review queue as new.
--   - public clients must not read review queues such as topic_candidates.
--   - admin/service-role API routes read and mutate review queues because the
--     service role bypasses RLS and is gated by x-admin-secret in /api/admin/*.

alter table edits enable row level security;
alter table reports enable row level security;
alter table hallucination_reports enable row level security;
alter table topic_candidates enable row level security;

drop policy if exists edits_public_insert_only on edits;
create policy edits_public_insert_only
  on edits for insert to anon
  with check (status = 'new');

drop policy if exists reports_public_insert_only on reports;
create policy reports_public_insert_only
  on reports for insert to anon
  with check (status = 'new');

drop policy if exists hallucination_reports_public_insert_only on hallucination_reports;
create policy hallucination_reports_public_insert_only
  on hallucination_reports for insert to anon
  with check (status = 'new');

-- Keep anonymous topic suggestions/candidates write-only. The review queue is
-- private and readable only via admin/service-role API routes.
drop policy if exists topic_candidates_public_select on topic_candidates;
drop policy if exists "public_select_topic_candidates" on topic_candidates;
drop policy if exists topic_candidates_public_update on topic_candidates;
