-- Bible v7 Book IV section 14 / Task 5-A: demand signals.
--
-- Tracks "wanted" claims: text the public is asking about that has no
-- existing claim yet. Two intake sources:
--   user_suggestion  -- explicit, identified suggestion -> opens immediately
--   search_gap       -- system-detected search gap -> requires 2 actors / 3
--                        distinct days / 3 signals within one dedupe epoch
--                        before it promotes from 'observing' to 'open'
--
-- Privacy: actor_key is a salted sha256 hash computed in the app layer
-- (never a raw IP), matching lib/contributor-hash.ts's existing convention.
-- Signals retain actor_key for 8 days only (see cleanup_wanted_claim_signals
-- below and scripts/jobs/cleanup-wanted-claim-signals.mjs).
--
-- Migration-drift note (tracked in issue #487): this migration intentionally
-- does NOT depend on supabase/migrations/20260629_source_contributions.sql
-- (contributors/source_candidates/contribution_events/contributor_points),
-- because that file's source_candidates table depends on the `source_authority`
-- enum type, which -- like several other "core" schema-v3.sql objects -- was
-- never applied to production. wanted_claim_suggesters only needs a minimal,
-- self-contained `contributors` identity table, created here with no
-- dependency on the drifted objects. The full source-contribution system
-- remains tracked separately in #487.

create table if not exists contributors (
  id uuid primary key default gen_random_uuid(),
  contributor_hash text unique,
  account_id uuid references auth.users(id) on delete set null,
  total_points integer not null default 0 check (total_points >= 0),
  accepted_source_count integer not null default 0 check (accepted_source_count >= 0),
  verified_claim_link_count integer not null default 0 check (verified_claim_link_count >= 0),
  spam_submission_count integer not null default 0 check (spam_submission_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contributors_identifier_required check (contributor_hash is not null or account_id is not null)
);

comment on table contributors is 'Privacy-safe contributor identity. Never store raw IP addresses; use contributor_hash and optional account_id only.';

create index if not exists contributors_account_id_idx on contributors(account_id);

-- ---------------------------------------------------------------------------
-- wanted_claims (Bible v7 section 4.7)
-- ---------------------------------------------------------------------------
create table if not exists wanted_claims (
  id uuid primary key default gen_random_uuid(),
  locale text not null,
  normalization_version integer not null,
  normalized_text text not null,
  normalized_hash text not null,
  status text not null default 'observing' check (status in (
    'observing','open','drafting','drafted','published',
    'rejected_editorial','closed_infra_failure'
  )),
  draft_failure_count integer not null default 0,
  draft_claim_id uuid,
  published_claim_id uuid,
  lease_owner text,
  lease_expires_at timestamptz,
  last_demand_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (locale, normalization_version, normalized_hash)
);

comment on table wanted_claims is 'Bible v7 Task 5-A demand intake. draft_claim_id/published_claim_id/lease_* columns are reserved for Task 5-B2/5-P1 and unused (always null) until those tasks land.';
comment on column wanted_claims.normalization_version is 'Bump when the normalization algorithm changes; write a backfill migration that re-normalizes existing observing/open rows and merges any resulting duplicates (see wanted_claim_normalize_v1).';

create index if not exists wanted_claims_status_idx on wanted_claims(status, last_demand_at desc);

-- ---------------------------------------------------------------------------
-- wanted_claim_demand_signals (Bible v7 section 4.8)
-- ---------------------------------------------------------------------------
create table if not exists wanted_claim_demand_signals (
  id uuid primary key default gen_random_uuid(),
  wanted_claim_id uuid not null references wanted_claims(id) on delete cascade,
  source text not null check (source in ('user_suggestion','search_gap')),
  bucket_date date not null,
  dedupe_epoch date not null,
  actor_key text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique (wanted_claim_id, source, bucket_date, dedupe_epoch, actor_key)
);

comment on table wanted_claim_demand_signals is 'Append-only demand signal log. actor_key is a salted hash, never a raw IP. Rows are deleted after expires_at (8 days) by cleanup_wanted_claim_signals().';

create index if not exists wanted_claim_demand_signals_claim_epoch_idx
  on wanted_claim_demand_signals(wanted_claim_id, dedupe_epoch);
create index if not exists wanted_claim_demand_signals_expires_idx
  on wanted_claim_demand_signals(expires_at);

-- ---------------------------------------------------------------------------
-- wanted_claim_suggesters (Bible v7 section 4.9)
-- ---------------------------------------------------------------------------
create table if not exists wanted_claim_suggesters (
  wanted_claim_id uuid not null references wanted_claims(id) on delete cascade,
  contributor_id uuid not null references contributors(id) on delete cascade,
  created_at timestamptz not null default now(),
  notification_sent_at timestamptz,
  primary key (wanted_claim_id, contributor_id)
);

comment on table wanted_claim_suggesters is 'Identified suggesters for a wanted claim, retained (not deleted by the 8-day signal retention job). notification_sent_at is populated by Task 5-D; always null until then.';

-- ---------------------------------------------------------------------------
-- Normalization (v1). Deterministic, immutable so it can be indexed/reused
-- safely; a future v2 must be a NEW function (see comment above) rather than
-- a mutation of this one, so existing normalized_hash values stay stable.
-- ---------------------------------------------------------------------------
create or replace function wanted_claim_normalize_v1(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(regexp_replace(lower(coalesce(p_text, '')), '\s+', ' ', 'g'));
$$;

create or replace function wanted_claim_normalized_hash(p_text text, p_version integer)
returns text
language plpgsql
immutable
set search_path = public, extensions
as $$
begin
  if p_version = 1 then
    return encode(digest(wanted_claim_normalize_v1(p_text), 'sha256'), 'hex');
  end if;
  raise exception 'unsupported normalization_version: %', p_version;
end;
$$;

-- ---------------------------------------------------------------------------
-- Promotion: only ever moves 'observing' -> 'open', never touches any other
-- status (drafting/drafted/published/rejected_editorial/closed_infra_failure
-- belong to later tasks). p_risk_flag=true permanently blocks automatic
-- promotion for that call's signal -- a risk-flagged wanted_claim simply
-- never leaves 'observing' via this function, which is itself the "route to
-- operator queue": 'observing' rows are never public (see RLS below) and are
-- readable only by admin/service-role tooling.
-- ---------------------------------------------------------------------------
create or replace function wanted_claim_maybe_promote(p_wanted_claim_id uuid, p_epoch date, p_risk_flag boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_distinct_days integer;
  v_distinct_actors integer;
  v_signal_count integer;
begin
  if p_risk_flag then
    return;
  end if;

  select count(distinct bucket_date), count(distinct actor_key), count(*)
    into v_distinct_days, v_distinct_actors, v_signal_count
  from wanted_claim_demand_signals
  where wanted_claim_id = p_wanted_claim_id
    and dedupe_epoch = p_epoch;

  if v_distinct_days >= 3 and v_distinct_actors >= 2 and v_signal_count >= 3 then
    update wanted_claims
       set status = 'open', updated_at = now()
     where id = p_wanted_claim_id
       and status = 'observing';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- submit_wanted_claim_signal: sole writer for all three tables. Callers pass
-- already-hashed identifiers (contributor_hash, actor_key) -- raw IPs never
-- reach this function or any log. p_risk_flag is computed app-side
-- (lib/wanted-claims.ts reputation/crime keyword check) and, when true,
-- prevents automatic promotion regardless of signal volume.
-- ---------------------------------------------------------------------------
create or replace function submit_wanted_claim_signal(
  p_locale text,
  p_raw_text text,
  p_source text,
  p_actor_key text,
  p_contributor_hash text default null,
  p_risk_flag boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_normalized_text text;
  v_normalized_hash text;
  v_wanted_claim_id uuid;
  v_status text;
  v_bucket_date date := (now() at time zone 'utc')::date;
  v_epoch date := date_trunc('week', now() at time zone 'utc')::date;
  v_expires_at timestamptz := now() + interval '8 days';
  v_contributor_id uuid;
begin
  if p_source not in ('user_suggestion', 'search_gap') then
    raise exception 'invalid source: %', p_source;
  end if;
  if p_locale is null or length(trim(p_locale)) = 0 then
    raise exception 'locale is required';
  end if;
  if p_actor_key is null or length(trim(p_actor_key)) = 0 then
    raise exception 'actor_key is required';
  end if;
  if p_raw_text is null or length(trim(p_raw_text)) = 0 then
    raise exception 'text is required';
  end if;
  if p_source = 'user_suggestion' and (p_contributor_hash is null or length(trim(p_contributor_hash)) = 0) then
    raise exception 'contributor_hash is required for user_suggestion';
  end if;

  v_normalized_text := wanted_claim_normalize_v1(p_raw_text);
  if length(v_normalized_text) = 0 then
    raise exception 'text normalizes to empty';
  end if;
  v_normalized_hash := wanted_claim_normalized_hash(p_raw_text, 1);

  insert into wanted_claims as w (locale, normalization_version, normalized_text, normalized_hash, status, last_demand_at)
  values (
    p_locale,
    1,
    v_normalized_text,
    v_normalized_hash,
    case when p_source = 'user_suggestion' and not p_risk_flag then 'open' else 'observing' end,
    now()
  )
  on conflict (locale, normalization_version, normalized_hash) do update
    set last_demand_at = now(),
        updated_at = now(),
        status = case
          when p_source = 'user_suggestion' and not p_risk_flag and w.status = 'observing' then 'open'
          else w.status
        end
  returning w.id, w.status into v_wanted_claim_id, v_status;

  insert into wanted_claim_demand_signals (wanted_claim_id, source, bucket_date, dedupe_epoch, actor_key, expires_at)
  values (v_wanted_claim_id, p_source, v_bucket_date, v_epoch, p_actor_key, v_expires_at)
  on conflict (wanted_claim_id, source, bucket_date, dedupe_epoch, actor_key) do nothing;

  if p_source = 'user_suggestion' then
    insert into contributors as c (contributor_hash)
    values (p_contributor_hash)
    on conflict (contributor_hash) do update set updated_at = now()
    returning c.id into v_contributor_id;

    insert into wanted_claim_suggesters (wanted_claim_id, contributor_id)
    values (v_wanted_claim_id, v_contributor_id)
    on conflict (wanted_claim_id, contributor_id) do nothing;
  end if;

  perform wanted_claim_maybe_promote(v_wanted_claim_id, v_epoch, p_risk_flag);

  select status into v_status from wanted_claims where id = v_wanted_claim_id;

  return jsonb_build_object('wanted_claim_id', v_wanted_claim_id, 'status', v_status);
end;
$$;

revoke all on function submit_wanted_claim_signal(text, text, text, text, text, boolean) from public;
grant execute on function submit_wanted_claim_signal(text, text, text, text, text, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- Retention: delete demand signals past their 8-day expiry. Called by
-- scripts/jobs/cleanup-wanted-claim-signals.mjs. wanted_claim_suggesters
-- rows are NOT touched -- suggesters are retained per Bible v7 section 14.
-- ---------------------------------------------------------------------------
create or replace function cleanup_wanted_claim_signals()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from wanted_claim_demand_signals where expires_at <= now();
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function cleanup_wanted_claim_signals() from public;
grant execute on function cleanup_wanted_claim_signals() to service_role;

-- ---------------------------------------------------------------------------
-- RLS: no anon/authenticated grants on any of these tables. This app has no
-- Supabase-Auth-JWT end-user identity (see docs/task5/TASK5_EXISTING_CODE_MAP.md
-- section 9) -- every public write already goes through a Next.js API route
-- using the service-role key, exactly like every other admin/contribution
-- write in this codebase (lib/admin-api.ts, lib/contributions.ts). "anon no
-- read" / "authenticated own suggestion via RPC only" (Bible v7 section 14)
-- is satisfied here by: zero table-level grants to anon or authenticated,
-- and submit_wanted_claim_signal as the sole entry point, executable only by
-- service_role. There is no separate client-authenticated path to bypass.
-- ---------------------------------------------------------------------------
alter table contributors enable row level security;
alter table wanted_claims enable row level security;
alter table wanted_claim_demand_signals enable row level security;
alter table wanted_claim_suggesters enable row level security;

drop policy if exists contributors_public_select on contributors;
drop policy if exists wanted_claims_public_select on wanted_claims;
drop policy if exists wanted_claim_demand_signals_public_select on wanted_claim_demand_signals;
drop policy if exists wanted_claim_suggesters_public_select on wanted_claim_suggesters;
-- No policies created: default-deny for anon and authenticated on all four
-- tables. All access is service-role via SECURITY DEFINER functions above.
