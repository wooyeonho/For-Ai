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

alter table source_suggestions enable row level security;

-- Anon may only INSERT pending suggestions (mirrors community_posts). The admin
-- review queue read/update flows through service-role /api/admin routes.
drop policy if exists source_suggestions_public_select on source_suggestions;
drop policy if exists source_suggestions_public_update on source_suggestions;
drop policy if exists source_suggestions_public_insert on source_suggestions;
create policy source_suggestions_public_insert
  on source_suggestions for insert to anon
  with check (status = 'pending');
