-- community_challenges: structured intake goals for accepted contribution candidates.
-- Challenge completion is not verification; verified facts still require claim_sources
-- and verification_events after human review.
create table if not exists community_challenges (
  challenge_id text primary key,
  title text not null,
  description text not null,
  category text not null,
  country text,
  target_metric text not null default 'accepted_contributions'
                check (target_metric in ('accepted_contributions')),
  target_count integer not null check (target_count > 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'draft'
         check (status in ('draft', 'active', 'completed', 'archived')),
  sponsor_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_challenges_valid_window check (ends_at > starts_at),
  constraint community_challenges_sponsor_label_not_blank check (
    sponsor_label is null or length(trim(sponsor_label)) > 0
  )
);

comment on table community_challenges is 'Community intake challenges. Sponsored challenges must set sponsor_label and be clearly labeled in UI.';
comment on column community_challenges.sponsor_label is 'Optional visible sponsor disclosure; never implies sponsor control of verification.';

create index if not exists community_challenges_status_idx on community_challenges(status);
create index if not exists community_challenges_category_idx on community_challenges(category);
create index if not exists community_challenges_country_idx on community_challenges(country);
create index if not exists community_challenges_window_idx on community_challenges(starts_at, ends_at);

-- challenge_progress: append-only accepted contribution progress events.
-- Only accepted contributions count toward progress. This is not a verification event.
create table if not exists challenge_progress (
  id uuid primary key default gen_random_uuid(),
  challenge_id text not null references community_challenges(challenge_id) on delete cascade,
  contribution_id uuid,
  contribution_kind text not null default 'topic_candidate'
                    check (contribution_kind in ('topic_candidate', 'topic_suggestion', 'edit', 'report', 'hallucination_report', 'manual')),
  contribution_status submission_status not null default 'accepted',
  count_delta integer not null default 1 check (count_delta > 0),
  contributor_hash text,
  accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint challenge_progress_only_accepted check (contribution_status = 'accepted')
);

comment on table challenge_progress is 'Progress ledger for accepted contributions only. Challenge completion does not automatically verify any claim.';
comment on column challenge_progress.contributor_hash is 'Optional privacy-safe contributor identifier; never store raw IP addresses.';

create index if not exists challenge_progress_challenge_accepted_idx on challenge_progress(challenge_id, accepted_at desc);
create unique index if not exists challenge_progress_unique_contribution_idx
  on challenge_progress(challenge_id, contribution_kind, contribution_id)
  where contribution_id is not null;

alter table community_challenges enable row level security;
alter table challenge_progress enable row level security;

create policy community_challenges_public_select
  on community_challenges for select to anon
  using (status in ('active', 'completed'));

create policy challenge_progress_public_select
  on challenge_progress for select to anon
  using (exists (
    select 1 from community_challenges c
    where c.challenge_id = challenge_progress.challenge_id
      and c.status in ('active', 'completed')
  ));
