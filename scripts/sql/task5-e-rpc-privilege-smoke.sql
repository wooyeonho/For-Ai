-- Task 5-E RPC privilege smoke.
-- Run only after both Task 5-E migrations are installed on a non-production
-- Supabase branch. This script is read-only with respect to application data.
-- It verifies both negative browser-role privileges and positive service-role
-- privileges for the worker RPC surface.

begin;

do $$
begin
  -- Browser roles inherit PUBLIC function privileges. If either role can execute
  -- these SECURITY DEFINER functions, the worker boundary is not fail-closed.
  if has_function_privilege(
       'anon',
       'public.lease_evidence_freshness(text,integer,integer)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.lease_evidence_freshness(text,integer,integer)',
       'EXECUTE'
     ) then
    raise exception 'Task 5-E privilege smoke: browser lease RPC privilege present';
  end if;

  if has_function_privilege(
       'anon',
       'public.complete_evidence_freshness(text,uuid,public.evidence_freshness_result,text,text,integer,text,jsonb)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.complete_evidence_freshness(text,uuid,public.evidence_freshness_result,text,text,integer,text,jsonb)',
       'EXECUTE'
     ) then
    raise exception 'Task 5-E privilege smoke: browser completion RPC privilege present';
  end if;

  if has_function_privilege(
       'anon',
       'public.task5_seed_evidence_freshness_state()',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.task5_seed_evidence_freshness_state()',
       'EXECUTE'
     ) then
    raise exception 'Task 5-E privilege smoke: browser seed trigger function privilege present';
  end if;

  -- A least-privilege migration must also leave the intended worker role able
  -- to execute the two application RPCs. Checking only denials can hide a
  -- deployment that is secure but non-functional.
  if not has_function_privilege(
       'service_role',
       'public.lease_evidence_freshness(text,integer,integer)',
       'EXECUTE'
     ) then
    raise exception 'Task 5-E privilege smoke: service_role cannot execute lease RPC';
  end if;

  if not has_function_privilege(
       'service_role',
       'public.complete_evidence_freshness(text,uuid,public.evidence_freshness_result,text,text,integer,text,jsonb)',
       'EXECUTE'
     ) then
    raise exception 'Task 5-E privilege smoke: service_role cannot execute completion RPC';
  end if;

  raise notice 'Task 5-E RPC privilege smoke passed: browser roles denied; service_role worker access present.';
end;
$$;

rollback;
