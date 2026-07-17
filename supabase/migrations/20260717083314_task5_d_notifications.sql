-- Task 5-D: durable, idempotent in-app notifications.
--
-- Task 5-P1 already writes the publication notification intent in the same
-- transaction as publication. This migration owns delivery: one row per
-- event/recipient, reason aggregation, SKIP LOCKED worker leases, bounded
-- retries, a durable dead-letter queue, and an authenticated unread inbox.

alter table public.notification_outbox
  add column if not exists worker_id text,
  add column if not exists locked_at timestamptz,
  add column if not exists lock_expires_at timestamptz,
  add column if not exists last_error_code text,
  add column if not exists dead_at timestamptz;

alter table public.notification_outbox
  drop constraint if exists notification_outbox_worker_id_length,
  add constraint notification_outbox_worker_id_length
    check (worker_id is null or length(worker_id) between 3 and 128),
  drop constraint if exists notification_outbox_error_code_shape,
  add constraint notification_outbox_error_code_shape
    check (last_error_code is null or last_error_code ~ '^[a-z0-9_]{1,64}$'),
  drop constraint if exists notification_outbox_delivery_state,
  add constraint notification_outbox_delivery_state check (
    (status = 'pending' and worker_id is null and locked_at is null and lock_expires_at is null and delivered_at is null and dead_at is null)
    or (status = 'processing' and worker_id is not null and locked_at is not null and lock_expires_at is not null and delivered_at is null and dead_at is null)
    or (status = 'delivered' and worker_id is null and locked_at is null and lock_expires_at is null and delivered_at is not null and dead_at is null)
    or (status = 'dead' and worker_id is null and locked_at is null and lock_expires_at is null and delivered_at is null and dead_at is not null)
  );

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.contributors(id) on delete restrict,
  event_id uuid not null references public.assisted_review_events(id) on delete restrict,
  reasons text[] not null check (cardinality(reasons) > 0),
  claim_id text not null references public.claims(id) on delete restrict,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (event_id, recipient_id)
);

comment on table public.notifications is
  'Task 5 in-app inbox. Authenticated users can read and mark read only rows mapped to their contributor account; service-role delivery is the only insert path.';

create index if not exists notifications_recipient_unread_idx
  on public.notifications (recipient_id, created_at desc)
  where read_at is null;
create index if not exists notifications_claim_idx
  on public.notifications (claim_id, created_at desc);

create table if not exists public.notification_dead_letters (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid not null unique references public.notification_outbox(id) on delete restrict,
  event_id uuid not null references public.assisted_review_events(id) on delete restrict,
  recipient_id uuid not null references public.contributors(id) on delete restrict,
  reasons text[] not null check (cardinality(reasons) > 0),
  attempts integer not null check (attempts >= 1),
  error_code text not null check (error_code ~ '^[a-z0-9_]{1,64}$'),
  created_at timestamptz not null default now()
);

comment on table public.notification_dead_letters is
  'Private terminal delivery failures after the bounded Task 5-D retry budget. Contains no provider response bodies or recipient contact data.';

create index if not exists notification_dead_letters_created_idx
  on public.notification_dead_letters (created_at desc);
create index if not exists notification_dead_letters_event_idx
  on public.notification_dead_letters (event_id);
create index if not exists notification_dead_letters_recipient_idx
  on public.notification_dead_letters (recipient_id);

create or replace function public.task5_merge_notification_reasons(
  p_left text[],
  p_right text[]
)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(distinct reason order by reason), '{}'::text[])
  from unnest(coalesce(p_left, '{}'::text[]) || coalesce(p_right, '{}'::text[])) as reason
  where length(trim(reason)) > 0;
$$;

create or replace function public.task5_enqueue_review_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Publication notifies every retained wanted-claim suggester. P1's explicit
  -- insert remains as defense in depth; this trigger also aggregates reasons.
  if new.action = 'published' then
    insert into public.notification_outbox (event_id, recipient_id, reasons)
    select new.id, suggesters.contributor_id, array['wanted_claim_published']::text[]
    from public.wanted_claims wanted
    join public.wanted_claim_suggesters suggesters
      on suggesters.wanted_claim_id = wanted.id
    where wanted.draft_claim_id = new.claim_id
    on conflict on constraint notification_outbox_event_id_recipient_id_key
    do update set reasons = public.task5_merge_notification_reasons(
      public.notification_outbox.reasons,
      excluded.reasons
    );
  end if;

  -- An operator who also has a contributor identity receives the review event.
  -- If that operator was also the proposer, the unique key collapses both roles
  -- into one notification and the reasons array preserves both explanations.
  insert into public.notification_outbox (event_id, recipient_id, reasons)
  select
    new.id,
    contributor.id,
    array[format('assisted_review_%s', new.action)]::text[]
  from public.contributors contributor
  where contributor.account_id = new.admin_user_id
  on conflict on constraint notification_outbox_event_id_recipient_id_key
  do update set reasons = public.task5_merge_notification_reasons(
    public.notification_outbox.reasons,
    excluded.reasons
  );

  return new;
end;
$$;

drop trigger if exists task5_enqueue_review_notifications on public.assisted_review_events;
create trigger task5_enqueue_review_notifications
after insert on public.assisted_review_events
for each row execute function public.task5_enqueue_review_notifications();

-- Backfill safely if 5-D is installed after review events already exist.
insert into public.notification_outbox (event_id, recipient_id, reasons)
select event.id, suggesters.contributor_id, array['wanted_claim_published']::text[]
from public.assisted_review_events event
join public.wanted_claims wanted on wanted.draft_claim_id = event.claim_id
join public.wanted_claim_suggesters suggesters on suggesters.wanted_claim_id = wanted.id
where event.action = 'published'
on conflict on constraint notification_outbox_event_id_recipient_id_key
do update set reasons = public.task5_merge_notification_reasons(
  public.notification_outbox.reasons,
  excluded.reasons
);

insert into public.notification_outbox (event_id, recipient_id, reasons)
select event.id, contributor.id, array[format('assisted_review_%s', event.action)]::text[]
from public.assisted_review_events event
join public.contributors contributor on contributor.account_id = event.admin_user_id
on conflict on constraint notification_outbox_event_id_recipient_id_key
do update set reasons = public.task5_merge_notification_reasons(
  public.notification_outbox.reasons,
  excluded.reasons
);

create or replace function public.lease_notification_outbox(
  p_worker_id text,
  p_limit integer default 25,
  p_lease_seconds integer default 120,
  p_max_attempts integer default 5
)
returns setof public.notification_outbox
language plpgsql
security definer
set search_path = ''
as $$
begin
  if length(trim(coalesce(p_worker_id, ''))) not between 3 and 128 then
    raise exception 'lease_notification_outbox: invalid worker_id';
  end if;
  if p_limit not between 1 and 100 then
    raise exception 'lease_notification_outbox: limit must be 1..100';
  end if;
  if p_lease_seconds not between 30 and 900 then
    raise exception 'lease_notification_outbox: lease_seconds must be 30..900';
  end if;
  if p_max_attempts not between 1 and 20 then
    raise exception 'lease_notification_outbox: max_attempts must be 1..20';
  end if;

  with exhausted as (
    update public.notification_outbox outbox
    set status = 'dead',
        worker_id = null,
        locked_at = null,
        lock_expires_at = null,
        dead_at = now(),
        last_error_code = coalesce(outbox.last_error_code, 'lease_expired')
    where outbox.status = 'processing'
      and outbox.lock_expires_at <= now()
      and outbox.attempts >= p_max_attempts
    returning outbox.*
  )
  insert into public.notification_dead_letters (
    outbox_id, event_id, recipient_id, reasons, attempts, error_code
  )
  select id, event_id, recipient_id, reasons, attempts, last_error_code
  from exhausted
  on conflict (outbox_id) do nothing;

  return query
  with candidates as (
    select outbox.id
    from public.notification_outbox outbox
    where (
      (outbox.status = 'pending' and outbox.next_attempt_at <= now())
      or (outbox.status = 'processing' and outbox.lock_expires_at <= now())
    )
      and outbox.attempts < p_max_attempts
    order by outbox.next_attempt_at, outbox.created_at, outbox.id
    for update skip locked
    limit p_limit
  )
  update public.notification_outbox outbox
  set status = 'processing',
      attempts = outbox.attempts + 1,
      worker_id = trim(p_worker_id),
      locked_at = now(),
      lock_expires_at = now() + make_interval(secs => p_lease_seconds),
      last_error_code = null,
      dead_at = null
  from candidates
  where outbox.id = candidates.id
  returning outbox.*;
end;
$$;

create or replace function public.complete_notification_outbox(
  p_outbox_id uuid,
  p_worker_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  outbox public.notification_outbox;
  review_event public.assisted_review_events;
  notification_id uuid;
begin
  select * into outbox
  from public.notification_outbox
  where id = p_outbox_id
  for update;

  if not found then
    raise exception 'complete_notification_outbox: row not found';
  end if;

  if outbox.status = 'delivered' then
    select id into notification_id
    from public.notifications
    where event_id = outbox.event_id and recipient_id = outbox.recipient_id;
    return jsonb_build_object('changed', false, 'notification_id', notification_id);
  end if;

  if outbox.status <> 'processing'
     or outbox.worker_id <> trim(coalesce(p_worker_id, ''))
     or outbox.lock_expires_at <= now() then
    raise exception 'complete_notification_outbox: active worker lease required';
  end if;

  select * into review_event
  from public.assisted_review_events
  where id = outbox.event_id;
  if not found then
    raise exception 'complete_notification_outbox: review event missing';
  end if;

  insert into public.notifications (recipient_id, event_id, reasons, claim_id)
  values (outbox.recipient_id, outbox.event_id, outbox.reasons, review_event.claim_id)
  on conflict on constraint notifications_event_id_recipient_id_key
  do update set reasons = public.task5_merge_notification_reasons(
    public.notifications.reasons,
    excluded.reasons
  )
  returning id into notification_id;

  update public.notification_outbox
  set status = 'delivered',
      worker_id = null,
      locked_at = null,
      lock_expires_at = null,
      delivered_at = now(),
      dead_at = null,
      last_error_code = null
  where id = outbox.id;

  update public.wanted_claim_suggesters suggesters
  set notification_sent_at = coalesce(suggesters.notification_sent_at, now())
  from public.wanted_claims wanted
  where wanted.id = suggesters.wanted_claim_id
    and wanted.draft_claim_id = review_event.claim_id
    and suggesters.contributor_id = outbox.recipient_id;

  return jsonb_build_object('changed', true, 'notification_id', notification_id);
end;
$$;

create or replace function public.fail_notification_outbox(
  p_outbox_id uuid,
  p_worker_id text,
  p_error_code text,
  p_max_attempts integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  outbox public.notification_outbox;
  terminal boolean;
  retry_seconds integer;
begin
  if coalesce(p_error_code, '') !~ '^[a-z0-9_]{1,64}$' then
    raise exception 'fail_notification_outbox: invalid error_code';
  end if;
  if p_max_attempts not between 1 and 20 then
    raise exception 'fail_notification_outbox: max_attempts must be 1..20';
  end if;

  select * into outbox
  from public.notification_outbox
  where id = p_outbox_id
  for update;

  if not found then
    raise exception 'fail_notification_outbox: row not found';
  end if;
  if outbox.status = 'dead' then
    return jsonb_build_object('changed', false, 'dead', true);
  end if;
  if outbox.status <> 'processing'
     or outbox.worker_id <> trim(coalesce(p_worker_id, '')) then
    raise exception 'fail_notification_outbox: active worker lease required';
  end if;

  terminal := outbox.attempts >= p_max_attempts;
  retry_seconds := least(3600, (30 * power(2, greatest(outbox.attempts - 1, 0)))::integer);

  update public.notification_outbox
  set status = case when terminal then 'dead' else 'pending' end,
      worker_id = null,
      locked_at = null,
      lock_expires_at = null,
      next_attempt_at = case when terminal then next_attempt_at else now() + make_interval(secs => retry_seconds) end,
      last_error_code = p_error_code,
      dead_at = case when terminal then now() else null end
  where id = outbox.id;

  if terminal then
    insert into public.notification_dead_letters (
      outbox_id, event_id, recipient_id, reasons, attempts, error_code
    ) values (
      outbox.id, outbox.event_id, outbox.recipient_id,
      outbox.reasons, outbox.attempts, p_error_code
    )
    on conflict (outbox_id) do nothing;
  end if;

  return jsonb_build_object(
    'changed', true,
    'dead', terminal,
    'next_attempt_in_seconds', case when terminal then null else retry_seconds end
  );
end;
$$;

alter table public.notifications enable row level security;
alter table public.notification_dead_letters enable row level security;

create or replace function public.task5_current_user_owns_contributor(
  p_recipient_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.contributors contributor
    where contributor.id = p_recipient_id
      and contributor.account_id = auth.uid()
  );
$$;

drop policy if exists notifications_owner_select on public.notifications;
create policy notifications_owner_select
  on public.notifications for select to authenticated
  using (public.task5_current_user_owns_contributor(recipient_id));

drop policy if exists notifications_owner_mark_read on public.notifications;
create policy notifications_owner_mark_read
  on public.notifications for update to authenticated
  using (public.task5_current_user_owns_contributor(recipient_id))
  with check (public.task5_current_user_owns_contributor(recipient_id));

revoke all on table public.notifications from public, anon, authenticated;
revoke all on table public.notification_dead_letters from public, anon, authenticated;
revoke all on table public.notification_outbox from public, anon, authenticated;
grant select on table public.notifications to authenticated;
grant update (read_at) on table public.notifications to authenticated;
grant select, insert, update on table public.notifications to service_role;
grant select, insert on table public.notification_dead_letters to service_role;
grant select, insert, update on table public.notification_outbox to service_role;

revoke all on function public.task5_merge_notification_reasons(text[], text[])
  from public, anon, authenticated, service_role;
revoke all on function public.task5_enqueue_review_notifications()
  from public, anon, authenticated, service_role;
revoke all on function public.task5_current_user_owns_contributor(uuid)
  from public, anon, service_role;
grant execute on function public.task5_current_user_owns_contributor(uuid)
  to authenticated;
revoke all on function public.lease_notification_outbox(text, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.lease_notification_outbox(text, integer, integer, integer)
  to service_role;
revoke all on function public.complete_notification_outbox(uuid, text)
  from public, anon, authenticated;
grant execute on function public.complete_notification_outbox(uuid, text)
  to service_role;
revoke all on function public.fail_notification_outbox(uuid, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.fail_notification_outbox(uuid, text, text, integer)
  to service_role;

comment on function public.lease_notification_outbox(text, integer, integer, integer) is
  'Service-role Task 5-D worker lease using SKIP LOCKED. Reclaims expired leases and dead-letters exhausted rows.';
comment on function public.complete_notification_outbox(uuid, text) is
  'Atomically creates or merges one in-app notification and marks its outbox row delivered. Safe to replay after success.';
comment on function public.fail_notification_outbox(uuid, text, text, integer) is
  'Returns a leased outbox row to bounded exponential retry or records a sanitized terminal dead letter.';
