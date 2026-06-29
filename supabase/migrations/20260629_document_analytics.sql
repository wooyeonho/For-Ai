-- Claim-level registry analytics. Raw IP addresses are forbidden; visitor_hash
-- and user_agent_hash are salted/hashed request metadata only.
alter table document_stats
  add column if not exists human_view_count bigint not null default 0,
  add column if not exists bot_view_count bigint not null default 0,
  add column if not exists ai_crawler_view_count bigint not null default 0,
  add column if not exists api_cite_count bigint not null default 0,
  add column if not exists citation_copy_count bigint not null default 0,
  add column if not exists report_submission_count bigint not null default 0;

create table if not exists document_read_events (
  id uuid primary key default gen_random_uuid(),
  document_id text not null references documents(id) on delete cascade,
  event_type text not null check (event_type in ('read','api_cite','citation_copy','report_submission')),
  actor_type text not null check (actor_type in ('human','bot','ai_crawler')),
  crawler_name text,
  visitor_hash text,
  user_agent_hash text,
  created_at timestamptz not null default now()
);

comment on table document_read_events is 'Privacy-safe read/citation analytics. Never store raw IP addresses; store contributor-style visitor_hash only.';
comment on column document_read_events.visitor_hash is 'Salted non-raw visitor identifier derived from request IP when available; raw IP is forbidden.';
comment on column document_read_events.user_agent_hash is 'Hashed user-agent for coarse duplicate/debug analysis without storing raw user-agent text.';

create index if not exists document_read_events_document_created_idx on document_read_events (document_id, created_at desc);
create index if not exists document_read_events_type_actor_idx on document_read_events (event_type, actor_type);

alter table document_read_events enable row level security;
-- No public policies: writes are server-side through service-role routes; admin
-- summaries read aggregate counters from document_stats.
