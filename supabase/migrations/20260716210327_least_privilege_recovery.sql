-- Emergency least-privilege recovery after the production schema audit.
-- Data is unchanged; this migration only narrows role privileges.

-- Internal SECURITY DEFINER RPCs are callable only by the server-side service
-- role. Supabase's default ACL grants EXECUTE directly to anon/authenticated,
-- so revoking only from PUBLIC is insufficient.
revoke execute on function public.increment_rate_limit(text, text, integer, bigint)
  from public, anon, authenticated;
grant execute on function public.increment_rate_limit(text, text, integer, bigint)
  to service_role;

revoke execute on function public.set_task5_phase(integer, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.set_task5_phase(integer, text, uuid, text)
  to service_role;

-- TRUNCATE bypasses RLS. Browser-facing roles never need it.
revoke truncate on all tables in schema public from anon, authenticated;

-- Canonical fact and audit writes go through server-side, admin-gated routes.
revoke insert, update, delete on table
  public.claims,
  public.claim_sources,
  public.documents,
  public.verification_events
from anon, authenticated;

revoke all privileges on table
  public.admin_audit_events,
  public.rate_limit_counters
from anon, authenticated;

-- Prevent the same privilege leak on future postgres-owned public objects.
alter default privileges for role postgres in schema public
  revoke truncate on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
