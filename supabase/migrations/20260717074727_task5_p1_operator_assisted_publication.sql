-- Task 5-P1: designated-operator assisted publication.
--
-- Applied as production migration 20260717074727. This installs the
-- publication boundary but does not activate it.
-- task5_settings.phase remains the DB source of truth and production remains
-- at phase 0 until the separate 14-day / 50-sample gate is approved.

-- ---------------------------------------------------------------------------
-- Versioned deterministic policy and append-only review/publication evidence.
-- ---------------------------------------------------------------------------

create table if not exists public.task5_deterministic_policies (
  version text primary key,
  rules jsonb not null,
  effective_from timestamptz not null,
  created_at timestamptz not null default now()
);

comment on table public.task5_deterministic_policies is
  'Append-only deterministic risk policies. publish_assisted_claim accepts only the latest effective version.';

insert into public.task5_deterministic_policies (version, rules, effective_from)
values (
  'task5-risk-keywords-v1',
  '{"classifier":"isReputationOrCrimeRisk","normal_requires_model_normal":true}'::jsonb,
  timestamptz '2026-07-16 00:00:00+00'
)
on conflict (version) do nothing;

drop trigger if exists task5_deterministic_policies_immutable_update on public.task5_deterministic_policies;
create trigger task5_deterministic_policies_immutable_update
before update on public.task5_deterministic_policies
for each row execute function public.task5_reject_mutation();

drop trigger if exists task5_deterministic_policies_immutable_delete on public.task5_deterministic_policies;
create trigger task5_deterministic_policies_immutable_delete
before delete on public.task5_deterministic_policies
for each row execute function public.task5_reject_mutation();

-- Phase 1 adds assisted publication on top of the Phase 0 drafting pipeline.
-- Keep intake moving in both phases; later phases require their own explicit
-- migration and gate instead of inheriting this permission accidentally.
create or replace function public.lease_task5_wanted_claims(
  p_worker_id text,
  p_limit integer,
  p_lease_seconds integer,
  p_scheduled_for timestamptz,
  p_correlation_id text,
  p_prompt_version text,
  p_risk_prompt_version text
)
returns table (
  run_id uuid,
  attempt_id uuid,
  wanted_claim_id uuid,
  locale text,
  normalized_text text,
  attempt_number integer,
  lease_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_run_id uuid;
begin
  if p_worker_id is null or length(trim(p_worker_id)) = 0 then
    raise exception 'lease_task5_wanted_claims: worker_id is required';
  end if;
  if p_limit < 1 or p_limit > 10 then
    raise exception 'lease_task5_wanted_claims: limit must be 1..10';
  end if;
  if p_lease_seconds < 60 or p_lease_seconds > 1800 then
    raise exception 'lease_task5_wanted_claims: lease_seconds must be 60..1800';
  end if;
  if not exists (
    select 1 from public.task5_settings
    where id = true and phase in (0, 1) and draft_enabled = true
  ) then
    raise exception 'lease_task5_wanted_claims: drafting is disabled for this phase';
  end if;

  perform public.recover_expired_task5_draft_leases();

  insert into public.task5_runs (run_type, scheduled_for, correlation_id)
  values ('shadow_draft', p_scheduled_for, p_correlation_id)
  returning id into new_run_id;

  return query
  with selected as (
    select w.id
    from public.wanted_claims w
    where w.status = 'open'
      and w.draft_claim_id is null
      and (w.lease_expires_at is null or w.lease_expires_at < now())
    order by w.last_demand_at desc nulls last, w.created_at
    for update skip locked
    limit p_limit
  ), leased as (
    update public.wanted_claims w
    set status = 'drafting',
        lease_owner = p_worker_id,
        lease_expires_at = now() + make_interval(secs => p_lease_seconds),
        updated_at = now()
    from selected s
    where w.id = s.id
    returning w.*
  ), attempts as (
    insert into public.draft_attempts (
      wanted_claim_id, run_id, worker_id, prompt_version,
      risk_prompt_version, idempotency_key, attempt_number, lease_expires_at
    )
    select l.id,
           new_run_id,
           p_worker_id,
           p_prompt_version,
           p_risk_prompt_version,
           l.id::text || ':' || coalesce((
             select max(a.attempt_number) + 1
             from public.draft_attempts a where a.wanted_claim_id = l.id
           ), 1)::text,
           coalesce((
             select max(a.attempt_number) + 1
             from public.draft_attempts a where a.wanted_claim_id = l.id
           ), 1),
           l.lease_expires_at
    from leased l
    returning *
  )
  select new_run_id, a.id, l.id, l.locale, l.normalized_text,
         a.attempt_number, a.lease_expires_at
  from attempts a
  join leased l on l.id = a.wanted_claim_id;

  update public.task5_runs r
  set leased_count = (select count(*) from public.draft_attempts a where a.run_id = new_run_id)
  where r.id = new_run_id;

  update public.task5_runs
  set state = 'completed', completed_at = now()
  where id = new_run_id and leased_count = 0;
end;
$$;

create table if not exists public.assisted_review_events (
  id uuid primary key default gen_random_uuid(),
  claim_id text not null references public.claims(id) on delete cascade,
  claim_version_id uuid not null references public.claim_versions(id) on delete restrict,
  action text not null check (action in (
    'published', 'rejected', 'escalated', 'refetch_requested', 'held', 'version_created'
  )),
  reason text not null check (length(trim(reason)) between 3 and 2000),
  admin_user_id uuid not null references public.admin_users(user_id) on delete restrict,
  admin_user_hash text not null check (admin_user_hash ~ '^[0-9a-f]{64}$'),
  verification_policy_version integer references public.verification_policies(version) on delete restrict,
  risk_assessment_id uuid references public.risk_assessments(id) on delete restrict,
  idempotency_key text not null unique check (length(idempotency_key) between 8 and 128),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint assisted_review_events_no_raw_request_metadata check (
    not (metadata ?| array['ip', 'raw_ip', 'client_ip', 'x_forwarded_for', 'x_real_ip', 'user_agent', 'raw_user_agent'])
  )
);

comment on table public.assisted_review_events is
  'Append-only human review and assisted-publication ledger. Actor identity stays private; public receipts use an explicit safe projection.';

create index if not exists assisted_review_events_claim_idx
  on public.assisted_review_events (claim_id, created_at desc, id desc);
create index if not exists assisted_review_events_version_idx
  on public.assisted_review_events (claim_version_id, created_at desc, id desc);

drop trigger if exists assisted_review_events_immutable_update on public.assisted_review_events;
create trigger assisted_review_events_immutable_update
before update on public.assisted_review_events
for each row execute function public.task5_reject_mutation();

drop trigger if exists assisted_review_events_immutable_delete on public.assisted_review_events;
create trigger assisted_review_events_immutable_delete
before delete on public.assisted_review_events
for each row execute function public.task5_reject_mutation();

-- Task 5-D will deliver these rows. P1 creates the durable transaction-bound
-- fan-out record so publication and notification intent cannot diverge.
create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.assisted_review_events(id) on delete restrict,
  recipient_id uuid not null references public.contributors(id) on delete restrict,
  reasons text[] not null check (cardinality(reasons) > 0),
  status text not null default 'pending' check (status in ('pending','processing','delivered','dead')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  unique (event_id, recipient_id)
);

comment on table public.notification_outbox is
  'Private durable notification intents. Task 5-P1 inserts publication intents; Task 5-D owns delivery and retry behavior.';

create index if not exists notification_outbox_pending_idx
  on public.notification_outbox (next_attempt_at, created_at)
  where status in ('pending','processing');

-- ---------------------------------------------------------------------------
-- UTF-16 helpers: application evidence offsets use JavaScript string indices.
-- These helpers let PostgreSQL re-validate the same boundaries, including
-- non-BMP characters that occupy two UTF-16 code units.
-- ---------------------------------------------------------------------------

create or replace function public.task5_utf16_length(p_value text)
returns integer
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  i integer;
  total integer := 0;
  ch text;
begin
  if char_length(p_value) = 0 then return 0; end if;
  for i in 1..char_length(p_value) loop
    ch := substr(p_value, i, 1);
    total := total + case when ascii(ch) > 65535 then 2 else 1 end;
  end loop;
  return total;
end;
$$;

create or replace function public.task5_utf16_slice(
  p_value text,
  p_start integer,
  p_end integer
)
returns text
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  i integer;
  unit_position integer := 0;
  unit_width integer;
  ch text;
  result text := '';
  start_aligned boolean := false;
  end_aligned boolean := false;
begin
  if p_start < 0 or p_end <= p_start then return null; end if;
  if p_end > public.task5_utf16_length(p_value) then return null; end if;

  for i in 1..char_length(p_value) loop
    ch := substr(p_value, i, 1);
    unit_width := case when ascii(ch) > 65535 then 2 else 1 end;
    if unit_position = p_start then start_aligned := true; end if;
    if unit_position >= p_start and unit_position + unit_width <= p_end then
      result := result || ch;
    elsif unit_position < p_end and unit_position + unit_width > p_end then
      return null;
    end if;
    unit_position := unit_position + unit_width;
    if unit_position = p_end then end_aligned := true; exit; end if;
  end loop;

  if not start_aligned or not end_aligned then return null; end if;
  return result;
end;
$$;

create or replace function public.task5_text_occurrence_count(
  p_haystack text,
  p_needle text,
  p_stop_after integer default 2
)
returns integer
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  cursor_position integer := 1;
  relative_position integer;
  found_count integer := 0;
begin
  if p_needle = '' then return 0; end if;
  loop
    relative_position := strpos(substr(p_haystack, cursor_position), p_needle);
    exit when relative_position = 0;
    found_count := found_count + 1;
    exit when found_count >= greatest(p_stop_after, 1);
    cursor_position := cursor_position + relative_position;
  end loop;
  return found_count;
end;
$$;

-- Expand the direct-write guard to every field that can imply publication.
-- current_claim_version_id remains writable only because B2 creates it after
-- the claim row; changing text/value remains RPC-gated.
create or replace function public.task5_guard_ai_claim_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.content_origin = 'task5_ai' and (
    new.status is distinct from old.status
    or new.confidence is distinct from old.confidence
    or new.last_verified_at is distinct from old.last_verified_at
    or new.publication_state is distinct from old.publication_state
    or new.publication_mode is distinct from old.publication_mode
    or new.published_claim_version_id is distinct from old.published_claim_version_id
    or new.published_at is distinct from old.published_at
    or new.claim_text is distinct from old.claim_text
    or new.claim_value is distinct from old.claim_value
  ) then
    if coalesce(current_setting('task5.allow_publication_write', true), 'off') <> 'on' then
      raise exception 'task5_ai claims cannot be directly published or edited; use Task 5 assisted RPCs';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Phase-0 human review actions. These never publish.
-- ---------------------------------------------------------------------------

create or replace function public.record_task5_assisted_review(
  p_claim_id text,
  p_claim_version_id uuid,
  p_action text,
  p_reason text,
  p_admin_user_id uuid,
  p_admin_user_hash text,
  p_idempotency_key text
)
returns public.assisted_review_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  claim_row public.claims;
  event_row public.assisted_review_events;
  normalized_action text := lower(trim(coalesce(p_action, '')));
  resolved_hash text;
begin
  if normalized_action not in ('rejected','escalated','refetch_requested','held') then
    raise exception 'record_task5_assisted_review: invalid action';
  end if;
  if p_reason is null or length(trim(p_reason)) not between 3 and 2000 then
    raise exception 'record_task5_assisted_review: reason must be 3..2000 characters';
  end if;
  if p_idempotency_key is null or length(p_idempotency_key) not between 8 and 128 then
    raise exception 'record_task5_assisted_review: invalid idempotency key';
  end if;
  if not exists (select 1 from public.task5_settings where id = true) then
    raise exception 'record_task5_assisted_review: task5_settings row missing';
  end if;
  if not exists (
    select 1 from public.admin_users
    where user_id = p_admin_user_id and active = true
      and role in ('editor','verifier','moderator','admin')
  ) then
    raise exception 'record_task5_assisted_review: active editor role required';
  end if;
  resolved_hash := case
    when p_admin_user_hash ~ '^[0-9a-fA-F]{64}$' then lower(p_admin_user_hash)
    else encode(sha256(('task5-editor:' || p_admin_user_id::text)::bytea), 'hex')
  end;

  select * into event_row from public.assisted_review_events
  where idempotency_key = p_idempotency_key;
  if found then
    if event_row.claim_id <> p_claim_id
       or event_row.claim_version_id <> p_claim_version_id
       or event_row.action <> normalized_action then
      raise exception 'record_task5_assisted_review: idempotency key conflict';
    end if;
    return event_row;
  end if;

  select * into claim_row from public.claims where id = p_claim_id for update;
  if not found or claim_row.content_origin <> 'task5_ai' then
    raise exception 'record_task5_assisted_review: task5 AI claim not found';
  end if;
  if claim_row.current_claim_version_id is distinct from p_claim_version_id then
    raise exception 'record_task5_assisted_review: stale claim version';
  end if;
  if claim_row.published_claim_version_id is not null then
    raise exception 'record_task5_assisted_review: claim already published';
  end if;

  insert into public.assisted_review_events (
    claim_id, claim_version_id, action, reason, admin_user_id,
    admin_user_hash, idempotency_key, metadata
  ) values (
    p_claim_id, p_claim_version_id, normalized_action, trim(p_reason), p_admin_user_id,
    resolved_hash, p_idempotency_key, jsonb_build_object('phase', (select phase from public.task5_settings where id = true))
  ) returning * into event_row;

  if normalized_action = 'rejected' then
    update public.wanted_claims
    set status = 'rejected_editorial', updated_at = now()
    where draft_claim_id = p_claim_id and published_claim_id is null;
  end if;

  insert into public.admin_audit_events (
    admin_user_id, admin_user_hash, action, target_id, metadata
  ) values (
    p_admin_user_id, resolved_hash, 'task5.assisted_review.' || normalized_action, p_claim_id,
    jsonb_build_object('claim_version_id', p_claim_version_id, 'reason', trim(p_reason), 'event_id', event_row.id)
  );

  return event_row;
end;
$$;

-- Editing creates a new immutable version and intentionally carries no risk or
-- evidence forward. The new version therefore cannot publish until it has been
-- re-fetched and re-assessed.
create or replace function public.create_task5_claim_version(
  p_claim_id text,
  p_expected_claim_version_id uuid,
  p_new_text text,
  p_reason text,
  p_admin_user_id uuid,
  p_admin_user_hash text,
  p_idempotency_key text
)
returns table (
  claim_id text,
  claim_version_id uuid,
  version integer,
  changed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  claim_row public.claims;
  existing_event public.assisted_review_events;
  new_version public.claim_versions;
  resolved_hash text;
  next_version integer;
begin
  if p_new_text is null or length(trim(p_new_text)) not between 1 and 4000 then
    raise exception 'create_task5_claim_version: text must be 1..4000 characters';
  end if;
  if p_reason is null or length(trim(p_reason)) not between 3 and 2000 then
    raise exception 'create_task5_claim_version: reason must be 3..2000 characters';
  end if;
  if p_idempotency_key is null or length(p_idempotency_key) not between 8 and 128 then
    raise exception 'create_task5_claim_version: invalid idempotency key';
  end if;
  if not exists (select 1 from public.task5_settings where id = true) then
    raise exception 'create_task5_claim_version: task5_settings row missing';
  end if;
  if not exists (
    select 1 from public.admin_users
    where user_id = p_admin_user_id and active = true
      and role in ('editor','verifier','moderator','admin')
  ) then
    raise exception 'create_task5_claim_version: active editor role required';
  end if;
  resolved_hash := case
    when p_admin_user_hash ~ '^[0-9a-fA-F]{64}$' then lower(p_admin_user_hash)
    else encode(sha256(('task5-editor:' || p_admin_user_id::text)::bytea), 'hex')
  end;

  select * into existing_event from public.assisted_review_events
  where idempotency_key = p_idempotency_key;
  if found then
    if existing_event.claim_id <> p_claim_id or existing_event.action <> 'version_created' then
      raise exception 'create_task5_claim_version: idempotency key conflict';
    end if;
    select cv.version into next_version from public.claim_versions cv where cv.id = existing_event.claim_version_id;
    return query select p_claim_id, existing_event.claim_version_id, next_version, false;
    return;
  end if;

  select * into claim_row from public.claims where id = p_claim_id for update;
  if not found or claim_row.content_origin <> 'task5_ai' then
    raise exception 'create_task5_claim_version: task5 AI claim not found';
  end if;
  if claim_row.current_claim_version_id is distinct from p_expected_claim_version_id then
    raise exception 'create_task5_claim_version: stale claim version';
  end if;
  if claim_row.published_claim_version_id is not null then
    raise exception 'create_task5_claim_version: published claim cannot be edited in place';
  end if;

  select coalesce(max(cv.version), 0) + 1 into next_version
  from public.claim_versions cv where cv.claim_id = p_claim_id;

  insert into public.claim_versions (claim_id, version, text, text_hash, created_by)
  values (
    p_claim_id, next_version, trim(p_new_text),
    encode(sha256(convert_to(trim(p_new_text), 'UTF8')), 'hex'), p_admin_user_id
  ) returning * into new_version;

  perform set_config('task5.allow_publication_write', 'on', true);
  update public.claims
  set current_claim_version_id = new_version.id,
      claim_value = new_version.text,
      updated_at = now()
  where id = p_claim_id;

  insert into public.assisted_review_events (
    claim_id, claim_version_id, action, reason, admin_user_id,
    admin_user_hash, idempotency_key, metadata
  ) values (
    p_claim_id, new_version.id, 'version_created', trim(p_reason), p_admin_user_id,
    resolved_hash, p_idempotency_key,
    jsonb_build_object('previous_claim_version_id', p_expected_claim_version_id, 'requires_new_evidence_and_risk', true)
  );

  insert into public.admin_audit_events (
    admin_user_id, admin_user_hash, action, target_id, metadata
  ) values (
    p_admin_user_id, resolved_hash, 'task5.assisted_review.version_created', p_claim_id,
    jsonb_build_object('claim_version_id', new_version.id, 'version', next_version, 'reason', trim(p_reason))
  );

  return query select p_claim_id, new_version.id, next_version, true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Phase-1 publication boundary.
-- ---------------------------------------------------------------------------

create or replace function public.publish_assisted_claim(
  p_claim_id text,
  p_claim_version_id uuid,
  p_verification_policy_version integer,
  p_duplicate_reviewed boolean,
  p_reason text,
  p_admin_user_id uuid,
  p_admin_user_hash text,
  p_idempotency_key text
)
returns table (
  event_id uuid,
  claim_id text,
  claim_version_id uuid,
  document_slug text,
  published_at timestamptz,
  changed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  settings_row public.task5_settings;
  claim_row public.claims;
  document_row public.documents;
  version_row public.claim_versions;
  risk_row public.risk_assessments;
  policy_row public.verification_policies;
  existing_event public.assisted_review_events;
  created_event public.assisted_review_events;
  latest_deterministic_policy text;
  resolved_hash text;
  evidence_row record;
  quote_text text;
  context_text text;
  evidence_count integer := 0;
  source_count integer := 0;
  publish_time timestamptz := now();
begin
  if p_reason is null or length(trim(p_reason)) not between 3 and 2000 then
    raise exception 'publish_assisted_claim: reason must be 3..2000 characters';
  end if;
  if p_idempotency_key is null or length(p_idempotency_key) not between 8 and 128 then
    raise exception 'publish_assisted_claim: invalid idempotency key';
  end if;
  if p_duplicate_reviewed is distinct from true then
    raise exception 'publish_assisted_claim: duplicate review acknowledgement required';
  end if;
  if not exists (
    select 1 from public.admin_users
    where user_id = p_admin_user_id and active = true
      and role in ('editor','verifier','moderator','admin')
  ) then
    raise exception 'publish_assisted_claim: active designated editor required';
  end if;
  resolved_hash := case
    when p_admin_user_hash ~ '^[0-9a-fA-F]{64}$' then lower(p_admin_user_hash)
    else encode(sha256(('task5-editor:' || p_admin_user_id::text)::bytea), 'hex')
  end;

  select * into existing_event from public.assisted_review_events
  where idempotency_key = p_idempotency_key;
  if found then
    if existing_event.claim_id <> p_claim_id
       or existing_event.claim_version_id <> p_claim_version_id
       or existing_event.action <> 'published' then
      raise exception 'publish_assisted_claim: idempotency key conflict';
    end if;
    select d.slug, c.published_at into document_row.slug, publish_time
    from public.claims c join public.documents d on d.id = c.document_id
    where c.id = p_claim_id;
    return query select existing_event.id, p_claim_id, p_claim_version_id, document_row.slug, publish_time, false;
    return;
  end if;

  select * into settings_row from public.task5_settings where id = true for update;
  if not found then
    raise exception 'publish_assisted_claim: task5_settings row missing';
  end if;
  if settings_row.phase < 1 then
    raise exception 'publish_assisted_claim: Phase 1 is not enabled';
  end if;

  select * into claim_row from public.claims where id = p_claim_id for update;
  if not found or claim_row.content_origin <> 'task5_ai' then
    raise exception 'publish_assisted_claim: task5 AI claim not found';
  end if;
  if claim_row.current_claim_version_id is distinct from p_claim_version_id then
    raise exception 'publish_assisted_claim: stale claim version';
  end if;
  if claim_row.published_claim_version_id is not null then
    raise exception 'publish_assisted_claim: claim already published';
  end if;
  if claim_row.status <> 'needs_review' then
    raise exception 'publish_assisted_claim: claim is not awaiting review';
  end if;
  if claim_row.publication_state <> 'active' then
    raise exception 'publish_assisted_claim: quarantined or withdrawn claim cannot publish';
  end if;

  select * into version_row from public.claim_versions cv
  where cv.id = p_claim_version_id and cv.claim_id = p_claim_id;
  if not found or length(trim(version_row.text)) = 0 then
    raise exception 'publish_assisted_claim: claim version missing';
  end if;
  if encode(sha256(convert_to(version_row.text, 'UTF8')), 'hex') <> version_row.text_hash then
    raise exception 'publish_assisted_claim: claim version hash mismatch';
  end if;

  if not exists (
    select 1 from public.draft_attempts da
    where da.claim_id = p_claim_id and da.state = 'completed'
      and da.model_provenance <> '[]'::jsonb
      and da.model_id is not null and da.provider is not null
  ) then
    raise exception 'publish_assisted_claim: complete AI model provenance missing';
  end if;

  select version into latest_deterministic_policy
  from public.task5_deterministic_policies
  where effective_from <= now()
  order by effective_from desc, version desc
  limit 1;
  if latest_deterministic_policy is null then
    raise exception 'publish_assisted_claim: deterministic policy missing';
  end if;

  select * into risk_row from public.risk_assessments ra
  where ra.claim_version_id = p_claim_version_id
  order by ra.created_at desc, ra.id desc
  limit 1;
  if not found
     or risk_row.final_result <> 'normal'
     or risk_row.deterministic_result <> 'normal'
     or risk_row.model_result <> 'normal'
     or risk_row.deterministic_policy_version <> latest_deterministic_policy then
    raise exception 'publish_assisted_claim: latest current-policy risk assessment must be fully normal';
  end if;

  select * into policy_row from public.verification_policies
  where mode = 'assisted_operator' and effective_from <= now()
  order by effective_from desc, version desc
  limit 1;
  if not found or policy_row.version <> p_verification_policy_version then
    raise exception 'publish_assisted_claim: latest assisted policy version required';
  end if;
  if coalesce((policy_row.rules ->> 'requires_normal_risk')::boolean, false) is distinct from true
     or coalesce((policy_row.rules ->> 'auto_publish')::boolean, true) is distinct from false then
    raise exception 'publish_assisted_claim: assisted policy contract invalid';
  end if;

  for evidence_row in
    select ce.*, ss.canonical_url, ss.final_url, ss.retrieved_at,
           ss.http_status, ss.content_type, ss.normalized_text, ss.storage_path
    from public.claim_evidence ce
    join public.source_snapshots ss on ss.id = ce.source_snapshot_id
    where ce.claim_version_id = p_claim_version_id and ce.is_required = true
    order by ce.created_at, ce.id
  loop
    evidence_count := evidence_count + 1;
    if evidence_row.relation <> 'supports'
       or evidence_row.http_status < 200 or evidence_row.http_status >= 300
       or evidence_row.normalized_text is null
       or evidence_row.storage_path is not null then
      raise exception 'publish_assisted_claim: required evidence is not a directly verifiable support snapshot';
    end if;

    quote_text := public.task5_utf16_slice(
      evidence_row.normalized_text, evidence_row.quote_start, evidence_row.quote_end
    );
    if quote_text is null
       or encode(sha256(convert_to(quote_text, 'UTF8')), 'hex') <> evidence_row.quote_hash
       or public.task5_text_occurrence_count(evidence_row.normalized_text, quote_text, 2) <> 1 then
      raise exception 'publish_assisted_claim: evidence quote offset/hash/uniqueness mismatch';
    end if;

    context_text := public.task5_utf16_slice(
      evidence_row.normalized_text,
      greatest(0, evidence_row.quote_start - 160),
      least(public.task5_utf16_length(evidence_row.normalized_text), evidence_row.quote_end + 160)
    );
    if evidence_row.context_hash is not null
       and (context_text is null or encode(sha256(convert_to(context_text, 'UTF8')), 'hex') <> evidence_row.context_hash) then
      raise exception 'publish_assisted_claim: evidence context hash mismatch';
    end if;

    insert into public.claim_sources (
      id, claim_id, source_type, source_authority, title, url,
      source_domain, citation, observed_at, source_check_status,
      source_trust_score, source_check_notes
    ) values (
      'task5-evidence-' || evidence_row.id::text,
      p_claim_id, 'web', 'unknown', left(evidence_row.final_url, 500), evidence_row.final_url,
      lower(split_part(regexp_replace(evidence_row.final_url, '^https?://', ''), '/', 1)),
      null, evidence_row.retrieved_at, 'passed', 50,
      'Immutable safe-fetch snapshot; human assisted publication.'
    ) on conflict (id) do nothing;
  end loop;
  if evidence_count < 1 then
    raise exception 'publish_assisted_claim: at least one required support evidence record is required';
  end if;

  -- B2 creates one claim per AI draft document. Refuse mixed/multi-claim
  -- documents until an all-claims atomic publication contract exists; marking
  -- such a document verified could otherwise expose an unreviewed sibling.
  if exists (
    select 1 from public.claims sibling
    where sibling.document_id = claim_row.document_id and sibling.id <> p_claim_id
  ) then
    raise exception 'publish_assisted_claim: document must contain exactly one claim';
  end if;

  select * into document_row from public.documents where id = claim_row.document_id for update;
  if not found or document_row.status not in ('ai_draft','needs_review') then
    raise exception 'publish_assisted_claim: document is not an unpublished draft';
  end if;

  select count(*) into source_count from public.claim_sources cs where cs.claim_id = p_claim_id;

  perform set_config('task5.allow_publication_write', 'on', true);
  perform set_config('task5.allow_publication_state_write', 'on', true);
  update public.claims
  set claim_value = version_row.text,
      status = 'verified',
      confidence = case when source_count >= 2 then 'high'::public.confidence_level else 'medium'::public.confidence_level end,
      publication_mode = 'assisted_operator',
      publication_state = 'active',
      published_claim_version_id = p_claim_version_id,
      published_at = publish_time,
      last_verified_at = publish_time,
      updated_at = publish_time
  where id = p_claim_id;

  update public.documents
  set status = 'verified',
      confidence = case when source_count >= 2 then 'high'::public.confidence_level else 'medium'::public.confidence_level end,
      last_verified_at = publish_time,
      updated_at = publish_time
  where id = document_row.id;

  insert into public.verification_events (
    claim_id, event_type, previous_status, new_status,
    previous_confidence, new_confidence, note, contributor_hash
  ) values (
    p_claim_id, 'status_changed', claim_row.status, 'verified',
    claim_row.confidence,
    case when source_count >= 2 then 'high'::public.confidence_level else 'medium'::public.confidence_level end,
    'Human-assisted publication under verification policy v' || policy_row.version::text || ': ' || trim(p_reason),
    resolved_hash
  );

  insert into public.assisted_review_events (
    claim_id, claim_version_id, action, reason, admin_user_id,
    admin_user_hash, verification_policy_version, risk_assessment_id,
    idempotency_key, metadata
  ) values (
    p_claim_id, p_claim_version_id, 'published', trim(p_reason), p_admin_user_id,
    resolved_hash, policy_row.version, risk_row.id, p_idempotency_key,
    jsonb_build_object(
      'phase', settings_row.phase,
      'duplicate_reviewed', true,
      'evidence_count', evidence_count,
      'source_count', source_count,
      'publication_mode', 'assisted_operator',
      'content_origin', 'task5_ai'
    )
  ) returning * into created_event;

  update public.wanted_claims
  set status = 'published', published_claim_id = p_claim_id, updated_at = publish_time
  where draft_claim_id = p_claim_id;

  insert into public.notification_outbox (event_id, recipient_id, reasons)
  select created_event.id, ws.contributor_id, array['wanted_claim_published']::text[]
  from public.wanted_claims wc
  join public.wanted_claim_suggesters ws on ws.wanted_claim_id = wc.id
  where wc.draft_claim_id = p_claim_id
  on conflict on constraint notification_outbox_event_id_recipient_id_key do nothing;

  insert into public.admin_audit_events (
    admin_user_id, admin_user_hash, action, target_id, metadata
  ) values (
    p_admin_user_id, resolved_hash, 'task5.assisted_publication.published', p_claim_id,
    jsonb_build_object(
      'claim_version_id', p_claim_version_id,
      'verification_policy_version', policy_row.version,
      'risk_assessment_id', risk_row.id,
      'event_id', created_event.id,
      'reason', trim(p_reason)
    )
  );

  return query select created_event.id, p_claim_id, p_claim_version_id, document_row.slug, publish_time, true;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS and grants. Browser roles cannot inspect drafts, review actors, source
-- bodies, or notification recipients. Admin API routes use service role only
-- after Supabase Auth + admin_users authorization.
-- ---------------------------------------------------------------------------

alter table public.task5_deterministic_policies enable row level security;
alter table public.assisted_review_events enable row level security;
alter table public.notification_outbox enable row level security;

revoke all on table public.task5_deterministic_policies from public, anon, authenticated;
revoke all on table public.assisted_review_events from public, anon, authenticated;
revoke all on table public.notification_outbox from public, anon, authenticated;

grant select on table public.task5_deterministic_policies to service_role;
grant select, insert on table public.assisted_review_events to service_role;
grant select, insert, update on table public.notification_outbox to service_role;

revoke all on function public.task5_utf16_length(text) from public, anon, authenticated, service_role;
revoke all on function public.task5_utf16_slice(text, integer, integer) from public, anon, authenticated, service_role;
revoke all on function public.task5_text_occurrence_count(text, text, integer) from public, anon, authenticated, service_role;

revoke all on function public.record_task5_assisted_review(text, uuid, text, text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.record_task5_assisted_review(text, uuid, text, text, uuid, text, text)
  to service_role;

revoke all on function public.create_task5_claim_version(text, uuid, text, text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.create_task5_claim_version(text, uuid, text, text, uuid, text, text)
  to service_role;

revoke all on function public.publish_assisted_claim(text, uuid, integer, boolean, text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.publish_assisted_claim(text, uuid, integer, boolean, text, uuid, text, text)
  to service_role;

comment on function public.publish_assisted_claim(text, uuid, integer, boolean, text, uuid, text, text) is
  'The only Task 5 AI publication path. Requires DB phase >=1, an active designated editor, current immutable version, complete AI provenance, latest fully-normal risk, latest assisted policy, DB-revalidated evidence offsets/hashes/context, duplicate acknowledgement, audit, verification event, notification intent, and idempotency.';
