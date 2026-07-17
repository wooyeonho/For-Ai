-- Task 5-F follow-up: production had older PUBLIC policies on
-- source_suggestions in addition to the tracked anon insert policy. Public
-- writes now pass through bounded, rate-limited server routes using the
-- service role, so the underlying review queue is private.

drop policy if exists public_insert_source_suggestions on public.source_suggestions;
drop policy if exists public_read_source_suggestions on public.source_suggestions;
drop policy if exists service_update_source_suggestions on public.source_suggestions;
drop policy if exists source_suggestions_public_insert on public.source_suggestions;
drop policy if exists source_suggestions_public_select on public.source_suggestions;
drop policy if exists source_suggestions_public_update on public.source_suggestions;
drop policy if exists source_suggestions_public_delete on public.source_suggestions;

revoke all on table public.source_suggestions from anon, authenticated;
grant select, insert, update, delete on table public.source_suggestions to service_role;

comment on table public.source_suggestions is
  'Private source-review queue. Public submissions must use bounded, rate-limited server routes; no direct anon/authenticated table access.';
