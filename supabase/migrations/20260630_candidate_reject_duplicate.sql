-- Allow admins to explicitly reject topic candidates that duplicate existing documents.
alter table topic_candidates
  drop constraint if exists topic_candidates_status_check;

alter table topic_candidates
  add constraint topic_candidates_status_check
  check (status in ('new','triaged','generated','rejected','reject_duplicate','promoted'));
