-- Harden legacy gamification ledgers against duplicate/retry point farming.
-- Rewards are reputation signals only; verified truth still requires claim_sources
-- and verification_events.

create table if not exists contributor_point_events (
  id uuid primary key default gen_random_uuid(),
  contributor_hash text not null,
  event_type text not null,
  points integer not null check (points >= 0),
  reference_id text,
  reference_type text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint contributor_point_events_reference_pair check (
    (reference_id is null and reference_type is null) or
    (reference_id is not null and reference_type is not null)
  )
);

create index if not exists contributor_point_events_contributor_idx
  on contributor_point_events(contributor_hash, created_at desc);

create unique index if not exists contributor_point_events_reference_once_idx
  on contributor_point_events(contributor_hash, event_type, reference_type, reference_id);

alter table contributor_point_events enable row level security;

create table if not exists contributor_badges (
  contributor_hash text not null,
  badge_slug text not null,
  awarded_at timestamptz not null default now(),
  primary key (contributor_hash, badge_slug)
);

alter table contributor_badges enable row level security;

create table if not exists source_suggestions (
  id uuid primary key default gen_random_uuid(),
  claim_id text not null,
  contributor_hash text not null,
  source_type text not null default 'web',
  url text,
  title text,
  citation text,
  domain text,
  status text not null default 'pending' check (status in ('pending','accepted','rejected','duplicate','spam')),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint source_suggestions_evidence_required check (url is not null or title is not null or citation is not null)
);

create index if not exists source_suggestions_status_created_idx
  on source_suggestions(status, created_at);
create index if not exists source_suggestions_contributor_claim_idx
  on source_suggestions(contributor_hash, claim_id, created_at desc);

-- Prevent same contributor from farming repeated points with the exact same URL
-- for the same claim while still allowing distinct evidence to be reviewed.
create unique index if not exists source_suggestions_claim_contributor_url_once_idx
  on source_suggestions(claim_id, contributor_hash, lower(url))
  where url is not null and status <> 'spam';

alter table source_suggestions enable row level security;
