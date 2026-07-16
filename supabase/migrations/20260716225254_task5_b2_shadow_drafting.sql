-- Task 5-B2: Phase-0 shadow drafting control plane (applied 20260716225254).
-- Additive only. No publication function, trigger, or public grant is created.

-- Task 5-A reserved these references as UUIDs before the canonical claims table
-- contract was reconciled. Claims use text primary keys, and both columns are
-- still null in production at the B2 gate, so convert them before first use.
alter table public.wanted_claims
  alter column draft_claim_id type text using draft_claim_id::text,
  alter column published_claim_id type text using published_claim_id::text;

alter table public.wanted_claims
  add constraint wanted_claims_draft_claim_id_fkey
    foreign key (draft_claim_id) references public.claims(id) on delete set null,
  add constraint wanted_claims_published_claim_id_fkey
    foreign key (published_claim_id) references public.claims(id) on delete set null;

create table public.task5_runs (
  id uuid primary key default gen_random_uuid(),
  run_type text not null check (run_type = 'shadow_draft'),
  scheduled_for timestamptz not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  state text not null default 'running' check (state in ('running','completed','partial','failed','skipped')),
  leased_count integer not null default 0 check (leased_count >= 0),
  success_count integer not null default 0 check (success_count >= 0),
  failure_count integer not null default 0 check (failure_count >= 0),
  correlation_id text not null unique,
  error_code text,
  created_at timestamptz not null default now()
);

create table public.draft_attempts (
  id uuid primary key default gen_random_uuid(),
  wanted_claim_id uuid not null references public.wanted_claims(id) on delete cascade,
  run_id uuid not null references public.task5_runs(id) on delete cascade,
  worker_id text not null,
  prompt_version text not null,
  risk_prompt_version text not null,
  idempotency_key text not null unique,
  state text not null default 'leased' check (state in (
    'leased','source_discovery','structuring','risk_assessment','completed',
    'retryable_failed','permanent_failed'
  )),
  attempt_number integer not null check (attempt_number > 0),
  lease_expires_at timestamptz not null,
  provider text,
  model_id text,
  provider_request_id text,
  model_provenance jsonb not null default '[]'::jsonb,
  source_snapshot_id uuid references public.source_snapshots(id) on delete restrict,
  claim_id text references public.claims(id) on delete set null,
  reserved_calls integer not null default 0 check (reserved_calls >= 0),
  reserved_input_tokens bigint not null default 0 check (reserved_input_tokens >= 0),
  reserved_output_tokens bigint not null default 0 check (reserved_output_tokens >= 0),
  reserved_cost_usd numeric(14,6) not null default 0 check (reserved_cost_usd >= 0),
  actual_input_tokens bigint not null default 0 check (actual_input_tokens >= 0),
  actual_output_tokens bigint not null default 0 check (actual_output_tokens >= 0),
  actual_cost_usd numeric(14,6) not null default 0 check (actual_cost_usd >= 0),
  error_class text,
  error_code text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (wanted_claim_id, attempt_number)
);

create index draft_attempts_active_lease_idx
  on public.draft_attempts (lease_expires_at)
  where state in ('leased','source_discovery','structuring','risk_assessment');
create index draft_attempts_run_idx on public.draft_attempts (run_id);

create table public.task5_budget_limits (
  provider text primary key,
  max_calls integer not null check (max_calls > 0),
  max_input_tokens bigint not null check (max_input_tokens > 0),
  max_output_tokens bigint not null check (max_output_tokens > 0),
  max_cost_usd numeric(14,6) not null check (max_cost_usd > 0),
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table public.cost_ledger (
  usage_date date not null,
  provider text not null references public.task5_budget_limits(provider) on delete restrict,
  reserved_calls integer not null default 0 check (reserved_calls >= 0),
  completed_calls integer not null default 0 check (completed_calls >= 0),
  reserved_input_tokens bigint not null default 0 check (reserved_input_tokens >= 0),
  reserved_output_tokens bigint not null default 0 check (reserved_output_tokens >= 0),
  actual_input_tokens bigint not null default 0 check (actual_input_tokens >= 0),
  actual_output_tokens bigint not null default 0 check (actual_output_tokens >= 0),
  reserved_cost numeric(14,6) not null default 0 check (reserved_cost >= 0),
  actual_cost numeric(14,6) not null default 0 check (actual_cost >= 0),
  budget_overshoot boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (usage_date, provider)
);

create table public.task5_cost_events (
  usage_key text primary key,
  attempt_id uuid not null references public.draft_attempts(id) on delete cascade,
  provider text not null references public.task5_budget_limits(provider) on delete restrict,
  state text not null default 'reserved' check (state in ('reserved','reconciled')),
  reserved_calls integer not null check (reserved_calls > 0),
  reserved_input_tokens bigint not null check (reserved_input_tokens >= 0),
  reserved_output_tokens bigint not null check (reserved_output_tokens >= 0),
  reserved_cost numeric(14,6) not null check (reserved_cost >= 0),
  actual_input_tokens bigint,
  actual_output_tokens bigint,
  actual_cost numeric(14,6),
  created_at timestamptz not null default now(),
  reconciled_at timestamptz
);

-- Disabled by default. An operator must explicitly enable both drafting and
-- provider budget before any paid call can be reserved.
insert into public.task5_budget_limits (
  provider, max_calls, max_input_tokens, max_output_tokens, max_cost_usd, enabled
)
values
  ('perplexity', 100, 200000, 100000, 5.000000, false),
  ('gpt', 100, 200000, 100000, 5.000000, false)
on conflict (provider) do nothing;

alter table public.task5_runs enable row level security;
alter table public.draft_attempts enable row level security;
alter table public.task5_budget_limits enable row level security;
alter table public.cost_ledger enable row level security;
alter table public.task5_cost_events enable row level security;

revoke all on table public.task5_runs, public.draft_attempts,
  public.task5_budget_limits, public.cost_ledger, public.task5_cost_events
  from public, anon, authenticated;
grant select, insert, update on table public.task5_runs, public.draft_attempts,
  public.task5_budget_limits, public.cost_ledger, public.task5_cost_events to service_role;

create or replace function public.set_task5_draft_enabled(
  p_enabled boolean,
  p_reason text,
  p_admin_user_id uuid default null,
  p_admin_user_hash text default null
)
returns public.task5_settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  result_row public.task5_settings;
  actor_hash text;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'set_task5_draft_enabled: reason is required';
  end if;

  actor_hash := case
    when p_admin_user_hash ~ '^[0-9a-fA-F]{64}$' then lower(p_admin_user_hash)
    else encode(sha256('unknown-admin'::bytea), 'hex')
  end;

  update public.task5_settings
  set draft_enabled = p_enabled,
      updated_at = now(),
      updated_by = p_admin_user_id
  where id = true
  returning * into result_row;

  if not found then
    raise exception 'set_task5_draft_enabled: task5_settings row is missing';
  end if;

  insert into public.admin_audit_events (
    admin_user_id, admin_user_hash, action, target_id, metadata
  ) values (
    case when exists (
      select 1 from public.admin_users where user_id = p_admin_user_id and active = true
    ) then p_admin_user_id else null end,
    actor_hash,
    'task5.draft_enabled_changed',
    'task5_settings',
    jsonb_build_object('draft_enabled', p_enabled, 'reason', p_reason)
  );

  return result_row;
end;
$$;

create or replace function public.recover_expired_task5_draft_leases()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  recovered integer;
begin
  with expired as (
    update public.draft_attempts
    set state = 'retryable_failed',
        error_class = 'lease',
        error_code = 'lease_expired',
        completed_at = now()
    where state in ('leased','source_discovery','structuring','risk_assessment')
      and lease_expires_at < now()
    returning wanted_claim_id
  ), reset_wanted as (
    update public.wanted_claims w
    set status = case when w.draft_failure_count + 1 >= 3 then 'closed_infra_failure' else 'open' end,
        draft_failure_count = w.draft_failure_count + 1,
        lease_owner = null,
        lease_expires_at = null,
        updated_at = now()
    where w.id in (select wanted_claim_id from expired)
      and w.status = 'drafting'
    returning w.id
  )
  select count(*) into recovered from reset_wanted;

  return recovered;
end;
$$;

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
    where id = true and phase = 0 and draft_enabled = true
  ) then
    raise exception 'lease_task5_wanted_claims: shadow drafting is disabled';
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

create or replace function public.reserve_task5_budget(
  p_usage_key text,
  p_attempt_id uuid,
  p_provider text,
  p_calls integer,
  p_input_tokens bigint,
  p_output_tokens bigint,
  p_cost numeric
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  limits public.task5_budget_limits;
  reserved_rows integer;
begin
  if p_usage_key is null or length(trim(p_usage_key)) = 0 then
    raise exception 'reserve_task5_budget: usage_key required';
  end if;
  if p_calls < 1 or p_input_tokens < 0 or p_output_tokens < 0 or p_cost < 0 then
    raise exception 'reserve_task5_budget: invalid reservation';
  end if;
  if not exists (
    select 1 from public.draft_attempts
    where id = p_attempt_id
      and state in ('leased','source_discovery','structuring','risk_assessment')
  ) then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_usage_key, 0));
  if exists (
    select 1 from public.task5_cost_events
    where usage_key = p_usage_key and attempt_id = p_attempt_id and provider = p_provider
  ) then
    return true;
  end if;

  select * into limits from public.task5_budget_limits
  where provider = p_provider and enabled = true
  for update;
  if not found then return false; end if;

  insert into public.cost_ledger (usage_date, provider)
  values (current_date, p_provider)
  on conflict (usage_date, provider) do nothing;

  update public.cost_ledger l
  set reserved_calls = l.reserved_calls + p_calls,
      reserved_input_tokens = l.reserved_input_tokens + p_input_tokens,
      reserved_output_tokens = l.reserved_output_tokens + p_output_tokens,
      reserved_cost = l.reserved_cost + p_cost,
      updated_at = now()
  where l.usage_date = current_date
    and l.provider = p_provider
    and greatest(l.reserved_calls, l.completed_calls) + p_calls <= limits.max_calls
    and greatest(l.reserved_input_tokens, l.actual_input_tokens) + p_input_tokens <= limits.max_input_tokens
    and greatest(l.reserved_output_tokens, l.actual_output_tokens) + p_output_tokens <= limits.max_output_tokens
    and greatest(l.reserved_cost, l.actual_cost) + p_cost <= limits.max_cost_usd;
  get diagnostics reserved_rows = row_count;

  if reserved_rows = 1 then
    insert into public.task5_cost_events (
      usage_key, attempt_id, provider, reserved_calls,
      reserved_input_tokens, reserved_output_tokens, reserved_cost
    ) values (
      p_usage_key, p_attempt_id, p_provider, p_calls,
      p_input_tokens, p_output_tokens, p_cost
    );
    update public.draft_attempts
    set reserved_calls = reserved_calls + p_calls,
        reserved_input_tokens = reserved_input_tokens + p_input_tokens,
        reserved_output_tokens = reserved_output_tokens + p_output_tokens,
        reserved_cost_usd = reserved_cost_usd + p_cost
    where id = p_attempt_id;
  end if;
  return reserved_rows = 1;
end;
$$;

create or replace function public.reconcile_task5_budget(
  p_usage_key text,
  p_input_tokens bigint,
  p_output_tokens bigint,
  p_cost numeric
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  limits public.task5_budget_limits;
  event_row public.task5_cost_events;
  overshoot boolean;
begin
  select * into event_row from public.task5_cost_events
  where usage_key = p_usage_key for update;
  if not found then raise exception 'reconcile_task5_budget: reservation missing'; end if;

  select * into limits from public.task5_budget_limits where provider = event_row.provider;
  if not found then raise exception 'reconcile_task5_budget: provider has no limit'; end if;

  if event_row.state = 'reconciled' then
    select budget_overshoot into overshoot from public.cost_ledger
    where usage_date = event_row.created_at::date and provider = event_row.provider;
    return coalesce(overshoot, true);
  end if;

  update public.cost_ledger
  set completed_calls = completed_calls + event_row.reserved_calls,
      actual_input_tokens = actual_input_tokens + greatest(p_input_tokens, 0),
      actual_output_tokens = actual_output_tokens + greatest(p_output_tokens, 0),
      actual_cost = actual_cost + greatest(p_cost, 0),
      updated_at = now()
  where usage_date = event_row.created_at::date and provider = event_row.provider;

  update public.cost_ledger
  set budget_overshoot = completed_calls > limits.max_calls
      or actual_input_tokens > limits.max_input_tokens
      or actual_output_tokens > limits.max_output_tokens
      or actual_cost > limits.max_cost_usd
  where usage_date = event_row.created_at::date and provider = event_row.provider
  returning budget_overshoot into overshoot;

  update public.task5_cost_events
  set state = 'reconciled',
      actual_input_tokens = greatest(p_input_tokens, 0),
      actual_output_tokens = greatest(p_output_tokens, 0),
      actual_cost = greatest(p_cost, 0),
      reconciled_at = now()
  where usage_key = p_usage_key;

  update public.draft_attempts
  set actual_input_tokens = actual_input_tokens + greatest(p_input_tokens, 0),
      actual_output_tokens = actual_output_tokens + greatest(p_output_tokens, 0),
      actual_cost_usd = actual_cost_usd + greatest(p_cost, 0)
  where id = event_row.attempt_id;

  return coalesce(overshoot, true);
end;
$$;

create or replace function public.record_task5_model_call(
  p_attempt_id uuid,
  p_stage text,
  p_provider text,
  p_model_id text,
  p_prompt_version text,
  p_provider_request_id text default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.draft_attempts
  set model_provenance = model_provenance || jsonb_build_array(jsonb_build_object(
    'stage', p_stage,
    'provider', p_provider,
    'model_id', p_model_id,
    'prompt_version', p_prompt_version,
    'provider_request_id', p_provider_request_id
  ))
  where id = p_attempt_id;
$$;

create or replace function public.complete_task5_shadow_draft(
  p_attempt_id uuid,
  p_worker_id text,
  p_source_snapshot_id uuid,
  p_answer text,
  p_quote_start integer,
  p_quote_end integer,
  p_quote_hash text,
  p_context_hash text,
  p_deterministic_result public.risk_result_type,
  p_model_result public.risk_result_type,
  p_deterministic_policy_version text,
  p_model_id text,
  p_prompt_version text,
  p_provider text,
  p_provider_request_id text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt_row public.draft_attempts;
  wanted_row public.wanted_claims;
  claim_id_value text;
  document_id_value text;
  slug_value text;
  version_id uuid;
  final_risk public.risk_result_type;
begin
  select * into attempt_row from public.draft_attempts where id = p_attempt_id for update;
  if not found then raise exception 'complete_task5_shadow_draft: attempt missing'; end if;
  if attempt_row.worker_id <> p_worker_id then raise exception 'complete_task5_shadow_draft: worker mismatch'; end if;
  if attempt_row.state = 'completed' and attempt_row.claim_id is not null then return attempt_row.claim_id; end if;
  if attempt_row.lease_expires_at < now() then raise exception 'complete_task5_shadow_draft: lease expired'; end if;
  if p_answer is null or length(trim(p_answer)) = 0 then raise exception 'complete_task5_shadow_draft: answer required'; end if;

  select * into wanted_row from public.wanted_claims where id = attempt_row.wanted_claim_id for update;
  if wanted_row.draft_claim_id is not null then return wanted_row.draft_claim_id; end if;

  final_risk := case
    when p_deterministic_result = 'high' or p_model_result = 'high' then 'high'::public.risk_result_type
    when p_deterministic_result = 'unknown' or p_model_result = 'unknown' then 'unknown'::public.risk_result_type
    else 'normal'::public.risk_result_type
  end;

  claim_id_value := 'task5-' || wanted_row.id::text;
  document_id_value := 'task5-shadow-' || wanted_row.id::text;
  slug_value := 'task5-' || replace(wanted_row.id::text, '-', '');

  insert into public.entities (id, type, canonical_name, country)
  values ('task5-shadow', 'task5_shadow', 'Task 5 Shadow Drafts', 'GLOBAL')
  on conflict (id) do nothing;

  insert into public.documents (
    id, entity_id, slug, lang, country, jurisdiction, canonical_slug,
    title, category, template, status, confidence, risk_tier,
    update_frequency, disclaimer_type, translation_status
  ) values (
    document_id_value, 'task5-shadow', slug_value, wanted_row.locale, 'GLOBAL', 'GLOBAL',
    slug_value, wanted_row.normalized_text, 'task5_shadow', document_id_value,
    'ai_draft', 'low', case when final_risk = 'normal' then 'low' else 'high' end,
    'event_based', 'check_official_source', 'source_language'
  ) on conflict (id) do nothing;

  insert into public.claims (
    id, document_id, entity_id, field_path, claim_text, claim_value,
    jurisdiction, country, risk_tier, update_frequency, disclaimer_type,
    lang, confidence, status, content_origin, publication_mode, publication_state
  ) values (
    claim_id_value, document_id_value, 'task5-shadow', 'task5.answer',
    wanted_row.normalized_text, trim(p_answer), 'GLOBAL', 'GLOBAL',
    case when final_risk = 'normal' then 'low' else 'high' end,
    'event_based', 'check_official_source', wanted_row.locale, 'low', 'needs_review',
    'task5_ai', 'assisted_operator', 'active'
  );

  insert into public.claim_versions (claim_id, version, text, text_hash)
  values (claim_id_value, 1, trim(p_answer), encode(sha256(convert_to(trim(p_answer), 'UTF8')), 'hex'))
  returning id into version_id;

  update public.claims set current_claim_version_id = version_id where id = claim_id_value;

  insert into public.claim_evidence (
    claim_version_id, source_snapshot_id, quote_start, quote_end,
    quote_hash, context_hash, relation, is_required
  ) values (
    version_id, p_source_snapshot_id, p_quote_start, p_quote_end,
    p_quote_hash, p_context_hash, 'supports', true
  );

  insert into public.risk_assessments (
    claim_version_id, deterministic_result, model_result, final_result,
    deterministic_policy_version, model_id, prompt_version,
    failure_reason
  ) values (
    version_id, p_deterministic_result, p_model_result, final_risk,
    p_deterministic_policy_version, p_model_id, p_prompt_version,
    case when p_model_result = 'unknown' then 'model_unknown_or_error' else null end
  );

  update public.wanted_claims
  set status = 'drafted', draft_claim_id = claim_id_value,
      lease_owner = null, lease_expires_at = null, updated_at = now()
  where id = wanted_row.id;

  update public.draft_attempts
  set state = 'completed', completed_at = now(), claim_id = claim_id_value,
      source_snapshot_id = p_source_snapshot_id, provider = p_provider,
      model_id = p_model_id, provider_request_id = p_provider_request_id
  where id = p_attempt_id;

  update public.task5_runs set success_count = success_count + 1 where id = attempt_row.run_id;
  return claim_id_value;
end;
$$;

create or replace function public.fail_task5_shadow_draft(
  p_attempt_id uuid,
  p_worker_id text,
  p_error_class text,
  p_error_code text,
  p_retryable boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt_row public.draft_attempts;
  failures integer;
begin
  select * into attempt_row from public.draft_attempts where id = p_attempt_id for update;
  if not found or attempt_row.state in ('completed','retryable_failed','permanent_failed') then return; end if;
  if attempt_row.worker_id <> p_worker_id then raise exception 'fail_task5_shadow_draft: worker mismatch'; end if;

  update public.draft_attempts
  set state = case when p_retryable then 'retryable_failed' else 'permanent_failed' end,
      error_class = left(coalesce(p_error_class, 'unknown'), 80),
      error_code = left(coalesce(p_error_code, 'unknown'), 120),
      completed_at = now()
  where id = p_attempt_id;

  update public.wanted_claims
  set draft_failure_count = draft_failure_count + 1,
      status = case
        when not p_retryable or draft_failure_count + 1 >= 3 then 'closed_infra_failure'
        else 'open'
      end,
      lease_owner = null, lease_expires_at = null, updated_at = now()
  where id = attempt_row.wanted_claim_id
  returning draft_failure_count into failures;

  update public.task5_runs set failure_count = failure_count + 1 where id = attempt_row.run_id;
end;
$$;

create or replace function public.finish_task5_run(p_run_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.task5_runs
  set completed_at = now(),
      state = case
        when failure_count = 0 then 'completed'
        when success_count > 0 then 'partial'
        else 'failed'
      end
  where id = p_run_id and state = 'running';
$$;

revoke all on function public.set_task5_draft_enabled(boolean,text,uuid,text) from public, anon, authenticated;
revoke all on function public.recover_expired_task5_draft_leases() from public, anon, authenticated;
revoke all on function public.lease_task5_wanted_claims(text,integer,integer,timestamptz,text,text,text) from public, anon, authenticated;
revoke all on function public.reserve_task5_budget(text,uuid,text,integer,bigint,bigint,numeric) from public, anon, authenticated;
revoke all on function public.reconcile_task5_budget(text,bigint,bigint,numeric) from public, anon, authenticated;
revoke all on function public.record_task5_model_call(uuid,text,text,text,text,text) from public, anon, authenticated;
revoke all on function public.complete_task5_shadow_draft(uuid,text,uuid,text,integer,integer,text,text,public.risk_result_type,public.risk_result_type,text,text,text,text,text) from public, anon, authenticated;
revoke all on function public.fail_task5_shadow_draft(uuid,text,text,text,boolean) from public, anon, authenticated;
revoke all on function public.finish_task5_run(uuid) from public, anon, authenticated;

grant execute on function public.set_task5_draft_enabled(boolean,text,uuid,text) to service_role;
grant execute on function public.recover_expired_task5_draft_leases() to service_role;
grant execute on function public.lease_task5_wanted_claims(text,integer,integer,timestamptz,text,text,text) to service_role;
grant execute on function public.reserve_task5_budget(text,uuid,text,integer,bigint,bigint,numeric) to service_role;
grant execute on function public.reconcile_task5_budget(text,bigint,bigint,numeric) to service_role;
grant execute on function public.record_task5_model_call(uuid,text,text,text,text,text) to service_role;
grant execute on function public.complete_task5_shadow_draft(uuid,text,uuid,text,integer,integer,text,text,public.risk_result_type,public.risk_result_type,text,text,text,text,text) to service_role;
grant execute on function public.fail_task5_shadow_draft(uuid,text,text,text,boolean) to service_role;
grant execute on function public.finish_task5_run(uuid) to service_role;

comment on table public.draft_attempts is 'Task 5-B2 attempt/idempotency/provenance ledger. Service-role only.';
comment on table public.task5_runs is 'Task 5-B2 scheduled shadow-run telemetry. Service-role only.';
comment on table public.cost_ledger is 'Daily atomic reservation and actual AI usage ledger. Service-role only.';
comment on function public.complete_task5_shadow_draft(uuid,text,uuid,text,integer,integer,text,text,public.risk_result_type,public.risk_result_type,text,text,text,text,text) is 'Creates needs-review Task-5 AI drafts and evidence only. It has no publication path.';
