-- Task 5-D follow-up: database-owned private inbox delivery scheduler.
--
-- This migration reconstructs the production schema change that was applied on
-- 2026-07-17 but was not preserved in the repository. It is intentionally
-- idempotent with respect to the named pg_cron job. Task 5 remains Phase 0 and
-- drafting remains disabled; this switch controls notification delivery only.

create extension if not exists pg_cron with schema pg_catalog;

alter table public.task5_settings
  add column if not exists notification_delivery_enabled boolean not null default true;

comment on column public.task5_settings.notification_delivery_enabled is
  'DB emergency switch for Task 5-D private inbox delivery. Independent of drafting and publication phase.';

create or replace function public.drain_notification_outbox(
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  delivery_enabled boolean;
  worker_id text;
  outbox public.notification_outbox;
  completion jsonb;
  failure jsonb;
  leased_count integer := 0;
  delivered_count integer := 0;
  failed_count integer := 0;
  dead_count integer := 0;
  worker_failure_count integer := 0;
begin
  if p_limit not between 1 and 100 then
    raise exception 'drain_notification_outbox: limit must be 1..100';
  end if;

  select notification_delivery_enabled
  into delivery_enabled
  from public.task5_settings
  where id = true;

  if not found or delivery_enabled is not true then
    return jsonb_build_object(
      'enabled', false,
      'leased', 0,
      'delivered', 0,
      'failed', 0,
      'dead', 0,
      'worker_failures', 0
    );
  end if;

  worker_id := format(
    'pg-cron:%s:%s',
    txid_current(),
    extract(epoch from clock_timestamp())::bigint
  );

  for outbox in
    select *
    from public.lease_notification_outbox(worker_id, p_limit, 120, 5)
  loop
    leased_count := leased_count + 1;
    begin
      completion := public.complete_notification_outbox(outbox.id, worker_id);
      if coalesce((completion ->> 'changed')::boolean, false) then
        delivered_count := delivered_count + 1;
      end if;
    exception when others then
      failed_count := failed_count + 1;
      begin
        failure := public.fail_notification_outbox(
          outbox.id,
          worker_id,
          'database_delivery_failed',
          5
        );
        if coalesce((failure ->> 'dead')::boolean, false) then
          dead_count := dead_count + 1;
        end if;
      exception when others then
        -- Leave the row leased. The existing lease-expiry path recovers it on
        -- a later run without exposing database error text.
        worker_failure_count := worker_failure_count + 1;
      end;
    end;
  end loop;

  return jsonb_build_object(
    'enabled', true,
    'leased', leased_count,
    'delivered', delivered_count,
    'failed', failed_count,
    'dead', dead_count,
    'worker_failures', worker_failure_count
  );
end;
$$;

comment on function public.drain_notification_outbox(integer) is
  'Atomically leases and completes private in-app notification rows. Returns only aggregate counters and stores no provider response text.';

revoke all on function public.drain_notification_outbox(integer)
  from public, anon, authenticated;
grant execute on function public.drain_notification_outbox(integer)
  to service_role;

-- cron.schedule(job_name, schedule, command) updates the existing named job on
-- supported pg_cron releases. Unscheduling first keeps this migration safe on
-- releases where schedule() would otherwise create a duplicate.
do $$
begin
  if exists (
    select 1 from cron.job
    where jobname = 'task5-notification-inbox-worker'
  ) then
    perform cron.unschedule('task5-notification-inbox-worker');
  end if;

  perform cron.schedule(
    'task5-notification-inbox-worker',
    '* * * * *',
    'select public.drain_notification_outbox(50);'
  );
end;
$$;
