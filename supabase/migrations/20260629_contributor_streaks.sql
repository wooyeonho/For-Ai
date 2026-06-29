-- Add privacy-preserving contributor streak accounting.
-- Streaks are calculated from contributors + contribution_events; raw IPs are never stored.

create table if not exists contributors (
  contributor_hash text primary key,
  display_name text,
  visit_streak_points bigint not null default 0,
  submission_streak_points bigint not null default 0,
  accepted_streak_points bigint not null default 0,
  verified_source_leaderboard_score bigint not null default 0,
  badges text[] not null default '{}',
  last_streak_calculated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contributors_hash_required check (length(contributor_hash) > 0)
);

create table if not exists contribution_events (
  id uuid primary key default gen_random_uuid(),
  contributor_hash text not null references contributors(contributor_hash) on delete cascade,
  event_type text not null check (event_type in ('visit','submission','accepted_contribution','verified_source')),
  submission_status submission_status,
  related_table text,
  related_id text,
  created_at timestamptz not null default now()
);

comment on table contributors is 'Privacy-preserving contributor profile keyed by contributor_hash only; never store raw IP addresses.';
comment on table contribution_events is 'Append-only source events for visit, submission, accepted contribution, and verified source streak calculation.';
comment on column contribution_events.submission_status is 'Rejected/spam submissions may be recorded for audit context but must be ignored by streak calculation.';

create index if not exists contribution_events_contributor_type_created_idx
  on contribution_events (contributor_hash, event_type, created_at desc);
create index if not exists contribution_events_type_created_idx
  on contribution_events (event_type, created_at desc);

alter table contributors enable row level security;
alter table contribution_events enable row level security;

-- No public policies: contribution streak data is updated by service-role routes/jobs only.
