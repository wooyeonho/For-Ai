-- Persist admin AI candidate-generation runs for reuse, cost tracking, and auditability.
create table if not exists candidate_generation_runs (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  lang text not null default 'ko',
  requested_count integer not null default 0,
  cross_verify boolean not null default false,
  requested_providers text[] not null default '{}',
  providers_used text[] not null default '{}',
  provider_results jsonb not null default '{}'::jsonb,
  consensus_summary jsonb,
  total_generated integer not null default 0,
  saved_count integer not null default 0,
  skipped_duplicates integer not null default 0,
  accepted_count integer not null default 0,
  promoted_count integer not null default 0,
  estimated_cost_usd numeric(12,6) not null default 0,
  status text not null default 'generated' check (status in ('generated','saved','duplicates','failed','save_failed')),
  save_error text,
  created_at timestamptz not null default now()
);

alter table topic_candidates
  add column if not exists generation_run_id uuid references candidate_generation_runs(id) on delete set null;

create index if not exists candidate_generation_runs_created_idx on candidate_generation_runs(created_at desc);
create index if not exists topic_candidates_generation_run_idx on topic_candidates(generation_run_id);

alter table candidate_generation_runs enable row level security;
-- No public policies: generation runs include paid-provider metadata and admin review metrics.
