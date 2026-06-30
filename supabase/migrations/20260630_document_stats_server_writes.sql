-- document_stats is public-read only. Counter writes must flow through
-- server-side routes that use the Supabase service-role client.
--
-- This migration intentionally preserves the public SELECT policy used by
-- static/wiki pages while removing the legacy anon INSERT/UPDATE policies from
-- 20260624_community_and_stats.sql.

alter table document_stats enable row level security;

drop policy if exists document_stats_public_insert on document_stats;
drop policy if exists document_stats_public_update on document_stats;

-- Keep public read access. Create the policy only when it is absent so this
-- migration is safe after environments that already applied the 20260624 file.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'document_stats'
      and policyname = 'document_stats_public_select'
  ) then
    create policy document_stats_public_select
      on document_stats for select to anon
      using (true);
  end if;
end $$;
