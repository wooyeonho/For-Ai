-- Task 5-E worker ACL smoke.
-- Run after BOTH Task 5-E migrations on a non-production database.
-- This script is read-only and fails if browser roles can execute worker helpers.

do $$
begin
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
    raise exception 'Task 5-E ACL smoke: browser role can execute seed trigger helper';
  end if;

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
    raise exception 'Task 5-E ACL smoke: browser role can execute lease RPC';
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
    raise exception 'Task 5-E ACL smoke: browser role can execute completion RPC';
  end if;

  if not has_function_privilege(
       'service_role',
       'public.lease_evidence_freshness(text,integer,integer)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'service_role',
       'public.complete_evidence_freshness(text,uuid,public.evidence_freshness_result,text,text,integer,text,jsonb)',
       'EXECUTE'
     ) then
    raise exception 'Task 5-E ACL smoke: service_role worker privilege missing';
  end if;
end;
$$;

select 'task5_e_worker_acl_smoke_passed' as result;
