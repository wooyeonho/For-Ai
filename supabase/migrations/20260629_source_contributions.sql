-- Source contribution system for public source candidates.
-- Points reward contribution activity only; points never determine claim truth.

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

create table if not exists source_candidates (
  id uuid primary key default gen_random_uuid(),
  document_id text references documents(id) on delete set null,
  entity_id text references entities(id) on delete set null,
  claim_id text references claims(id) on delete set null,
  field_path text,
  title text,
  url text,
  normalized_url text,
  citation text,
  source_type source_type not null default 'unknown',
  source_authority source_authority not null default 'unknown',
  message text,
  contributor_hash text,
  contributor_id uuid references contributors(id) on delete set null,
  duplicate_of uuid references source_candidates(id) on delete set null,
  status submission_status not null default 'new',
  review_status text not null default 'pending' check (review_status in ('pending','accepted','rejected','linked_to_claim','spam')),
  points_awarded integer not null default 0 check (points_awarded >= 0),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text,
  linked_claim_source_id text references claim_sources(id) on delete set null,
  constraint source_candidate_has_source check (url is not null or citation is not null or title is not null)
);

comment on table source_candidates is 'Unverified public source candidates. Human review is required before attaching to claim_sources or changing claim verification status.';
comment on column source_candidates.points_awarded is 'Contribution reward only; must not be used to decide claim truth, confidence, or verified status.';

create table if not exists contribution_events (
  id uuid primary key default gen_random_uuid(),
  contributor_id uuid references contributors(id) on delete set null,
  contributor_hash text,
  account_id uuid references auth.users(id) on delete set null,
  source_candidate_id uuid references source_candidates(id) on delete set null,
  claim_id text references claims(id) on delete set null,
  event_type text not null check (event_type in ('source_submitted','source_duplicate_submitted','source_admin_accepted','source_linked_verified_claim','source_spam_rejected')),
  points_delta integer not null default 0 check (points_delta >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint contribution_event_identifier_required check (contributor_hash is not null or account_id is not null)
);

comment on table contribution_events is 'Audit trail for contribution activity and point decisions. Does not determine factual truth.';
comment on column contribution_events.metadata is 'Safe metadata only. Never include raw IP addresses or raw user-agent strings.';

create table if not exists contributor_points (
  id uuid primary key default gen_random_uuid(),
  contributor_id uuid references contributors(id) on delete set null,
  contributor_hash text,
  account_id uuid references auth.users(id) on delete set null,
  contribution_event_id uuid references contribution_events(id) on delete cascade,
  points integer not null check (points >= 0),
  reason text not null,
  created_at timestamptz not null default now(),
  constraint contributor_points_identifier_required check (contributor_hash is not null or account_id is not null)
);

comment on table contributor_points is 'Point ledger for source contributions. Points are reputation signals, not claim verification evidence.';

create index if not exists contributors_account_id_idx on contributors(account_id);
create index if not exists source_candidates_claim_idx on source_candidates(claim_id, created_at desc);
create index if not exists source_candidates_document_idx on source_candidates(document_id, created_at desc);
create index if not exists source_candidates_normalized_url_idx on source_candidates(normalized_url);
create index if not exists source_candidates_status_idx on source_candidates(status, review_status, created_at desc);
create index if not exists contribution_events_contributor_idx on contribution_events(contributor_hash, created_at desc);
create index if not exists contributor_points_contributor_idx on contributor_points(contributor_hash, created_at desc);

alter table contributors enable row level security;
alter table source_candidates enable row level security;
alter table contribution_events enable row level security;
alter table contributor_points enable row level security;

create policy source_candidates_public_insert_only
  on source_candidates for insert to anon
  with check (status in ('new', 'spam_suspected') and review_status = 'pending');

-- No public SELECT policies: source candidates, contributors, events, and points
-- are private review/reputation data exposed only through service-role APIs.
