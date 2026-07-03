-- P0 security/integrity: provision the gamification tables that application code
-- reads/writes but that no prior migration ever created, and lock them down.
--
-- lib/gamification.ts, app/api/source-suggest, app/api/hallucination/[slug],
-- app/api/admin/source-suggestions, and app/api/gamification/leaderboard all
-- reference `contributor_point_events`, `contributor_badges`, and
-- `source_suggestions`. With no CREATE/RLS in tracked SQL, point/badge writes
-- fail silently (awardPoints ignored the insert error) or — worse, if the anon
-- key ever reaches these tables without RLS — allow unauthenticated point farming.
--
-- All statements are idempotent (IF NOT EXISTS / DROP ... IF EXISTS) so this is
-- safe whether the tables were hand-created in prod or are missing entirely.

-- ---------------------------------------------------------------------------
-- contributor_point_events: append-only ledger, summed into total points.
-- ---------------------------------------------------------------------------
create table if not exists contributor_point_events (
  id               uuid primary key default gen_random_uuid(),
  contributor_hash text not null,
  event_type       text not null,
  points           integer not null default 0,
  reference_id     text,
  reference_type   text,
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  constraint contributor_point_events_hash_required check (length(contributor_hash) > 0)
);

create index if not exists contributor_point_events_hash_idx
  on contributor_point_events (contributor_hash);
create index if not exists contributor_point_events_type_created_idx
  on contributor_point_events (event_type, created_at desc);

-- Audit rows removed by idempotency backfills before unique indexes are added.
-- This preserves the later duplicate rows for operator review while allowing the
-- live tables to enforce one canonical row per idempotency key.
create table if not exists migration_duplicate_audit (
  id              bigserial primary key,
  archived_table  text not null,
  original_id     uuid not null,
  duplicate_key   jsonb not null,
  row_data        jsonb not null,
  archived_reason text not null,
  archived_at     timestamptz not null default now(),
  constraint migration_duplicate_audit_once unique (archived_table, original_id)
);

-- Preflight existing production data before adding the idempotency index. Keep
-- the earliest row for each non-null reference-backed event and archive/delete
-- later duplicates so the unique index can be created safely.
with ranked_reference_events as (
  select
    id,
    contributor_hash,
    event_type,
    reference_type,
    reference_id,
    row_number() over (
      partition by contributor_hash, event_type, reference_type, reference_id
      order by created_at asc, id asc
    ) as duplicate_rank
  from contributor_point_events
  where reference_id is not null
), duplicate_reference_events as (
  select cpe.*
  from contributor_point_events cpe
  join ranked_reference_events ranked on ranked.id = cpe.id
  where ranked.duplicate_rank > 1
), archived_reference_events as (
  insert into migration_duplicate_audit (
    archived_table,
    original_id,
    duplicate_key,
    row_data,
    archived_reason
  )
  select
    'contributor_point_events',
    id,
    jsonb_build_object(
      'contributor_hash', contributor_hash,
      'event_type', event_type,
      'reference_type', reference_type,
      'reference_id', reference_id
    ),
    to_jsonb(duplicate_reference_events),
    'duplicate non-null reference-backed point event; earliest row kept before contributor_point_events_idem_idx'
  from duplicate_reference_events
  on conflict (archived_table, original_id) do nothing
  returning original_id
)
delete from contributor_point_events cpe
using duplicate_reference_events duplicate
where cpe.id = duplicate.id;

-- Idempotency guard against race-condition point multiplication: a given
-- (contributor, event_type, reference_type, reference_id) can only ever score
-- once. NULL reference_id rows stay NULL-distinct and are instead throttled by
-- route-level rate limits + spam gating.
drop index if exists contributor_point_events_idem_idx;
create unique index contributor_point_events_idem_idx
  on contributor_point_events (contributor_hash, event_type, reference_type, reference_id);

alter table contributor_point_events enable row level security;
-- No anon policies: points are written by service-role API routes only.
drop policy if exists contributor_point_events_public_select on contributor_point_events;
drop policy if exists contributor_point_events_public_insert on contributor_point_events;
drop policy if exists contributor_point_events_public_update on contributor_point_events;
drop policy if exists contributor_point_events_public_delete on contributor_point_events;

-- ---------------------------------------------------------------------------
-- contributor_badges: one row per earned badge; awarding is idempotent.
-- ---------------------------------------------------------------------------
create table if not exists contributor_badges (
  id               uuid primary key default gen_random_uuid(),
  contributor_hash text not null,
  badge_slug       text not null,
  awarded_at       timestamptz not null default now(),
  constraint contributor_badges_hash_required check (length(contributor_hash) > 0)
);

create unique index if not exists contributor_badges_unique_idx
  on contributor_badges (contributor_hash, badge_slug);

alter table contributor_badges enable row level security;
drop policy if exists contributor_badges_public_select on contributor_badges;
drop policy if exists contributor_badges_public_insert on contributor_badges;
drop policy if exists contributor_badges_public_update on contributor_badges;
drop policy if exists contributor_badges_public_delete on contributor_badges;

-- ---------------------------------------------------------------------------
-- source_suggestions: public source-submission review queue.
-- ---------------------------------------------------------------------------
create table if not exists source_suggestions (
  id               uuid primary key default gen_random_uuid(),
  claim_id         text not null,
  contributor_hash text not null,
  source_type      text not null default 'web',
  url              text,
  title            text,
  citation         text,
  domain           text,
  status           text not null default 'pending'
                   check (status in ('pending','accepted','rejected','duplicate','spam')),
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now()
);

-- Defensive column top-ups in case a hand-created table predates these fields.
alter table source_suggestions add column if not exists domain text;
alter table source_suggestions add column if not exists reviewed_at timestamptz;

create index if not exists source_suggestions_claim_idx on source_suggestions (claim_id);
create index if not exists source_suggestions_status_created_idx on source_suggestions (status, created_at);
-- Supports the per-claim/day contributor rate-limit count in source-suggest route.
create index if not exists source_suggestions_contributor_claim_created_idx
  on source_suggestions (contributor_hash, claim_id, created_at desc);

-- Preflight existing production data before adding the source suggestion
-- idempotency index. If hand-created production tables already contain repeated
-- contributor/claim/url rows, keep the earliest row and archive/delete later
-- duplicates so the unique index can be created safely.
with ranked_source_suggestions as (
  select
    id,
    contributor_hash,
    claim_id,
    url,
    row_number() over (
      partition by contributor_hash, claim_id, url
      order by created_at asc, id asc
    ) as duplicate_rank
  from source_suggestions
  where url is not null
), duplicate_source_suggestions as (
  select ss.*
  from source_suggestions ss
  join ranked_source_suggestions ranked on ranked.id = ss.id
  where ranked.duplicate_rank > 1
), archived_source_suggestions as (
  insert into migration_duplicate_audit (
    archived_table,
    original_id,
    duplicate_key,
    row_data,
    archived_reason
  )
  select
    'source_suggestions',
    id,
    jsonb_build_object(
      'contributor_hash', contributor_hash,
      'claim_id', claim_id,
      'url', url
    ),
    to_jsonb(duplicate_source_suggestions),
    'duplicate contributor/claim/url source suggestion; earliest row kept before source_suggestions_claim_contributor_url_once_idx'
  from duplicate_source_suggestions
  on conflict (archived_table, original_id) do nothing
  returning original_id
)
delete from source_suggestions ss
using duplicate_source_suggestions duplicate
where ss.id = duplicate.id;

create unique index if not exists source_suggestions_claim_contributor_url_once_idx
  on source_suggestions (claim_id, contributor_hash, url);

alter table source_suggestions enable row level security;

-- Anon may only INSERT pending suggestions (mirrors community_posts). The admin
-- review queue read/update flows through service-role /api/admin routes.
drop policy if exists source_suggestions_public_select on source_suggestions;
drop policy if exists source_suggestions_public_update on source_suggestions;
drop policy if exists source_suggestions_public_insert on source_suggestions;
create policy source_suggestions_public_insert
  on source_suggestions for insert to anon
  with check (status = 'pending');
