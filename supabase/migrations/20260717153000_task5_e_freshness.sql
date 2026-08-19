-- Task 5-E: evidence freshness inspection and operator recheck queue.
-- Additive only. This migration never changes claims.status, citation_status,
-- publication_state, confidence, or verification events automatically.

create type public.evidence_freshness_result as enum (
  'healthy',
  'redirected',
  'content_changed',
  'evidence_missing',
  'not_found',
  'temporarily_unavailable',
  'blocked',
  'fetch_error'
);

create type public.freshness_review_status as enum ('open', 'resolved', 'dismissed');

create table public.evidence_freshness_state (
  claim_evidence_id uuid primary key references public.claim_evidence(id) on delete cascade,
  latest_result public.evidence_freshness_result,
  last_attempt_at timestamptz,
  last_checked_at timestamptz,
  consecutive_temporary_failures integer not null default 0 check (consecutive_temporary_failures >= 0),
  next_check_at timestamptz not null default now(),
  worker_id text,
  locked_at timestamptz,
  lock_expires_at timestamptz,
  updated_at timestamptz not null default now(),
  check (
    (worker_id is null and locked_at is null and lock_expires_at is null)
    or (worker_id is not null and locked_at is not null and lock_expires_at is not null)
  )
);

create index evidence_freshness_state_due_idx
  on public.evidence_freshness_state (next_check_at, claim_evidence_id)
  where worker_id is null;

create table public.evidence_freshness_checks (
  id uuid primary key default gen_random_uuid(),
  claim_evidence_id uuid not null references public.claim_evidence(id) on delete restrict,
  result public.evidence_freshness_result not null,
  attempted_at timestamptz not null default now(),
  checked_at timestamptz,
  canonical_url text not null,
  final_url text,
  previous_normalized_text_hash text,
  current_normalized_text_hash text,
  http_status integer,
  error_code text,
  metadata jsonb not null default '{}'::jsonb,
  check (error_code is null or error_code ~ '^[a-z0-9_]{1,64}$')
);

create index evidence_freshness_checks_evidence_idx
  on public.evidence_freshness_checks (claim_evidence_id, attempted_at desc, id desc);

create table public.freshness_review_cards (
  id uuid primary key default gen_random_uuid(),
  claim_evidence_id uuid not null references public.claim_evidence(id) on delete restrict,
  claim_id text not null references public.claims(id) on delete restrict,
  trigger_result public.evidence_freshness_result not null,
  status public.freshness_review_status not null default 'open',
  priority integer not null default 100 check (priority between 0 and 1000),
  valid_until timestamptz,
  other_healthy_evidence_count integer not null default 0 check (other_healthy_evidence_count >= 0),
  first_opened_at timestamptz not null default now(),
  last_triggered_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index freshness_review_cards_one_open_per_evidence
  on public.freshness_review_cards (claim_evidence_id)
  where status = 'open';
create index freshness_review_cards_queue_idx
  on public.freshness_review_cards (status, priority desc, valid_until nulls last, first_opened_at);

insert into public.evidence_freshness_state (claim_evidence_id, next_check_at)
select evidence.id, coalesce(claims.valid_until, now())
from public.claim_evidence evidence
join public.claim_versions versions on versions.id = evidence.claim_version_id
join public.claims claims on claims.id = versions.claim_id
on conflict (claim_evidence_id) do nothing;

create or replace function public.task5_seed_evidence_freshness_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  due_at timestamptz;
begin
  select coalesce(claims.valid_until, now()) into due_at
  from public.claim_versions versions
  join public.claims claims on claims.id = versions.claim_id
  where versions.id = new.claim_version_id;

  insert into public.evidence_freshness_state (claim_evidence_id, next_check_at)
  values (new.id, coalesce(due_at, now()))
  on conflict (claim_evidence_id) do nothing;
  return new;
end;
$$;

create trigger task5_seed_evidence_freshness_state
after insert on public.claim_evidence
for each row execute function public.task5_seed_evidence_freshness_state();

create or replace function public.lease_evidence_freshness(
  p_worker_id text,
  p_limit integer default 25,
  p_lease_seconds integer default 120
)
returns table (
  claim_evidence_id uuid,
  claim_id text,
  claim_version_id uuid,
  canonical_url text,
  previous_final_url text,
  previous_normalized_text_hash text,
  quote_text text,
  valid_until timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if length(trim(coalesce(p_worker_id, ''))) not between 3 and 128 then
    raise exception 'lease_evidence_freshness: invalid worker_id';
  end if;
  if p_limit not between 1 and 100 then
    raise exception 'lease_evidence_freshness: limit must be 1..100';
  end if;
  if p_lease_seconds not between 30 and 900 then
    raise exception 'lease_evidence_freshness: lease_seconds must be 30..900';
  end if;

  update public.evidence_freshness_state state
  set worker_id = null, locked_at = null, lock_expires_at = null, updated_at = now()
  where state.worker_id is not null and state.lock_expires_at <= now();

  return query
  with candidates as (
    select state.claim_evidence_id
    from public.evidence_freshness_state state
    join public.claim_evidence evidence on evidence.id = state.claim_evidence_id
    join public.claim_versions versions on versions.id = evidence.claim_version_id
    join public.claims claims on claims.id = versions.claim_id
    where state.worker_id is null
      and state.next_check_at <= now()
      and claims.publication_state = 'active'
      and claims.published_claim_version_id = evidence.claim_version_id
    order by
      case when claims.valid_until is not null and claims.valid_until <= now() then 0 else 1 end,
      claims.valid_until nulls last,
      state.next_check_at,
      state.claim_evidence_id
    for update of state skip locked
    limit p_limit
  ), leased as (
    update public.evidence_freshness_state state
    set worker_id = trim(p_worker_id),
        locked_at = now(),
        lock_expires_at = now() + make_interval(secs => p_lease_seconds),
        updated_at = now()
    from candidates
    where state.claim_evidence_id = candidates.claim_evidence_id
    returning state.claim_evidence_id
  )
  select
    evidence.id,
    versions.claim_id,
    evidence.claim_version_id,
    snapshots.canonical_url,
    snapshots.final_url,
    snapshots.normalized_text_hash,
    case
      when snapshots.normalized_text is null then null
      else substring(snapshots.normalized_text from evidence.quote_start + 1 for evidence.quote_end - evidence.quote_start)
    end,
    claims.valid_until
  from leased
  join public.claim_evidence evidence on evidence.id = leased.claim_evidence_id
  join public.claim_versions versions on versions.id = evidence.claim_version_id
  join public.claims claims on claims.id = versions.claim_id
  join public.source_snapshots snapshots on snapshots.id = evidence.source_snapshot_id;
end;
$$;

create or replace function public.complete_evidence_freshness(
  p_worker_id text,
  p_claim_evidence_id uuid,
  p_result public.evidence_freshness_result,
  p_final_url text default null,
  p_current_normalized_text_hash text default null,
  p_http_status integer default null,
  p_error_code text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  state public.evidence_freshness_state;
  evidence public.claim_evidence;
  version public.claim_versions;
  claim public.claims;
  snapshot public.source_snapshots;
  temporary boolean;
  successful_fetch boolean;
  next_failures integer;
  should_open_card boolean;
  healthy_alternatives integer;
  next_due timestamptz;
begin
  select * into state from public.evidence_freshness_state
  where claim_evidence_id = p_claim_evidence_id for update;
  if not found then raise exception 'complete_evidence_freshness: state not found'; end if;
  if state.worker_id <> trim(coalesce(p_worker_id, '')) or state.lock_expires_at <= now() then
    raise exception 'complete_evidence_freshness: active worker lease required';
  end if;

  select * into evidence from public.claim_evidence where id = p_claim_evidence_id;
  select * into version from public.claim_versions where id = evidence.claim_version_id;
  select * into claim from public.claims where id = version.claim_id;
  select * into snapshot from public.source_snapshots where id = evidence.source_snapshot_id;

  temporary := p_result in ('temporarily_unavailable', 'blocked', 'fetch_error');
  successful_fetch := p_result in ('healthy', 'redirected', 'content_changed', 'evidence_missing');
  next_failures := case when temporary then state.consecutive_temporary_failures + 1 else 0 end;
  should_open_card := p_result in ('content_changed', 'evidence_missing', 'not_found')
    or (temporary and next_failures >= 3);

  next_due := case
    when temporary then now() + make_interval(hours => case
      when next_failures <= 1 then 6
      when next_failures = 2 then 12
      when next_failures = 3 then 24
      when next_failures = 4 then 48
      when next_failures = 5 then 96
      else 168
    end)
    when p_result = 'healthy' then now() + interval '30 days'
    when p_result = 'redirected' then now() + interval '14 days'
    else now() + interval '7 days'
  end;

  insert into public.evidence_freshness_checks (
    claim_evidence_id, result, attempted_at, checked_at, canonical_url, final_url,
    previous_normalized_text_hash, current_normalized_text_hash, http_status, error_code, metadata
  ) values (
    evidence.id, p_result, now(), case when successful_fetch then now() else null end,
    snapshot.canonical_url, p_final_url, snapshot.normalized_text_hash,
    p_current_normalized_text_hash, p_http_status, p_error_code, coalesce(p_metadata, '{}'::jsonb)
  );

  update public.evidence_freshness_state
  set latest_result = p_result,
      last_attempt_at = now(),
      last_checked_at = case when successful_fetch then now() else last_checked_at end,
      consecutive_temporary_failures = next_failures,
      next_check_at = next_due,
      worker_id = null,
      locked_at = null,
      lock_expires_at = null,
      updated_at = now()
  where claim_evidence_id = evidence.id;

  if should_open_card then
    select count(*)::integer into healthy_alternatives
    from public.claim_evidence other_evidence
    join public.evidence_freshness_state other_state on other_state.claim_evidence_id = other_evidence.id
    where other_evidence.claim_version_id = evidence.claim_version_id
      and other_evidence.id <> evidence.id
      and other_state.latest_result in ('healthy', 'redirected');

    insert into public.freshness_review_cards (
      claim_evidence_id, claim_id, trigger_result, priority, valid_until,
      other_healthy_evidence_count, first_opened_at, last_triggered_at, updated_at
    ) values (
      evidence.id, version.claim_id, p_result,
      case when claim.valid_until is not null and claim.valid_until <= now() then 900 else 500 end,
      claim.valid_until, healthy_alternatives, now(), now(), now()
    )
    on conflict (claim_evidence_id) where status = 'open'
    do update set
      trigger_result = excluded.trigger_result,
      priority = greatest(public.freshness_review_cards.priority, excluded.priority),
      valid_until = excluded.valid_until,
      other_healthy_evidence_count = excluded.other_healthy_evidence_count,
      last_triggered_at = now(),
      updated_at = now();
  end if;

  return jsonb_build_object(
    'result', p_result,
    'review_card_opened', should_open_card,
    'consecutive_temporary_failures', next_failures,
    'next_check_at', next_due
  );
end;
$$;

revoke all on public.evidence_freshness_state from anon, authenticated;
revoke all on public.evidence_freshness_checks from anon, authenticated;
revoke all on public.freshness_review_cards from anon, authenticated;
alter table public.evidence_freshness_state enable row level security;
alter table public.evidence_freshness_checks enable row level security;
alter table public.freshness_review_cards enable row level security;

revoke all on function public.task5_seed_evidence_freshness_state() from public;
revoke all on function public.lease_evidence_freshness(text, integer, integer) from public;
revoke all on function public.complete_evidence_freshness(text, uuid, public.evidence_freshness_result, text, text, integer, text, jsonb) from public;
grant execute on function public.lease_evidence_freshness(text, integer, integer) to service_role;
grant execute on function public.complete_evidence_freshness(text, uuid, public.evidence_freshness_result, text, text, integer, text, jsonb) to service_role;
