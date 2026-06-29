-- Unify public intake into a single topic candidate workflow.
-- Public submissions remain private candidate/suggestion intake only; they cannot
-- create verified documents or claims.

alter table topic_candidates
  drop constraint if exists topic_candidates_status_check;

update topic_candidates
set status = case status
  when 'reviewing' then 'triaged'
  when 'approved' then 'generated'
  when 'spam' then 'rejected'
  else status
end
where status in ('reviewing', 'approved', 'spam');

alter table topic_candidates
  add constraint topic_candidates_status_check
  check (status in ('new','triaged','generated','rejected','promoted'));

alter table topic_candidates
  drop constraint if exists topic_candidates_source_check;

alter table topic_candidates
  add constraint topic_candidates_source_check
  check (source in ('ai_generated','user_suggested','admin_created','correction_report','hallucination_report'));

alter table topic_suggestions
  add column if not exists created_at timestamptz not null default now();

alter table topic_suggestions
  alter column status type text using status::text;

alter table topic_suggestions
  drop constraint if exists topic_suggestions_status_check;

update topic_suggestions
set status = case status
  when 'reviewing' then 'triaged'
  when 'accepted' then 'generated'
  when 'spam' then 'rejected'
  else status
end
where status in ('reviewing', 'accepted', 'spam');

alter table topic_suggestions
  add constraint topic_suggestions_status_check
  check (status in ('new','triaged','generated','rejected','promoted'));

-- Keep public intake insert-only after expanding public candidate source kinds.
drop policy if exists public_insert_topic_candidates on topic_candidates;
drop policy if exists "public_insert_topic_candidates" on topic_candidates;
create policy public_insert_topic_candidates
  on topic_candidates for insert to anon
  with check (source in ('user_suggested','correction_report','hallucination_report') and status = 'new');
