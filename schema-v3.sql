-- For-Ai schema v3
-- Source of truth for the For-Ai global fact registry.
-- The canonical claim-level structure is:
-- entities -> documents -> claims -> claim_sources -> verification_events

create extension if not exists pgcrypto;

create type confidence_level as enum ('low', 'medium', 'high');
create type document_status as enum ('ai_draft', 'needs_review', 'verified', 'published', 'archived');
create type claim_status as enum ('needs_review', 'verified', 'disputed', 'unknown');
create type source_type as enum ('official', 'platform', 'review', 'user', 'phone', 'photo', 'document', 'web', 'other', 'unknown');
create type submission_status as enum ('new', 'reviewing', 'accepted', 'rejected', 'spam');
create type verification_event_type as enum ('created', 'reviewed', 'source_added', 'source_removed', 'status_changed', 'confidence_changed');

create table entities (
  id text primary key,
  type text not null,
  canonical_name text not null,
  country text not null,
  region text,
  city text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table documents (
  id text primary key,
  entity_id text not null references entities(id) on delete restrict,
  slug text not null,
  lang text not null,
  country text not null,
  title text not null,
  category text not null,
  template text not null,
  status document_status not null default 'ai_draft',
  confidence confidence_level not null default 'low',
  last_verified_at timestamptz,
  license_code text not null default 'for-ai-data-license-v0.1',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint documents_entity_id_required check (length(entity_id) > 0),
  constraint documents_slug_required check (length(slug) > 0),
  constraint documents_lang_required check (length(lang) > 0),
  constraint documents_country_required check (length(country) > 0),
  constraint documents_license_not_cc_by_sa check (license_code <> 'CC-BY-SA')
);

comment on column documents.data is 'Rendering convenience only. Canonical facts must exist as claims.';

create unique index documents_country_lang_slug_key on documents (country, lang, slug);
create unique index documents_entity_lang_template_key on documents (entity_id, lang, template);

create table claims (
  id text primary key,
  document_id text not null references documents(id) on delete cascade,
  entity_id text not null references entities(id) on delete restrict,
  field_path text not null,
  claim_text text not null,
  claim_value text not null,
  jurisdiction text,
  confidence confidence_level not null default 'low',
  status claim_status not null default 'needs_review',
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint claims_entity_id_required check (length(entity_id) > 0),
  constraint claims_field_path_required check (length(field_path) > 0)
);

create index claims_document_id_idx on claims (document_id);
create index claims_entity_id_idx on claims (entity_id);
create unique index claims_document_field_path_key on claims (document_id, field_path);

create table claim_sources (
  id text primary key,
  claim_id text not null references claims(id) on delete cascade,
  source_type source_type not null default 'unknown',
  title text,
  url text,
  citation text,
  observed_at timestamptz,
  contributor_hash text,
  created_at timestamptz not null default now()
);

create index claim_sources_claim_id_idx on claim_sources (claim_id);

create table edits (
  id uuid primary key default gen_random_uuid(),
  document_id text references documents(id) on delete set null,
  entity_id text references entities(id) on delete set null,
  field_path text,
  proposed_value text,
  reason text,
  contributor_hash text,
  status submission_status not null default 'new',
  created_at timestamptz not null default now()
);

create table reports (
  id uuid primary key default gen_random_uuid(),
  document_id text references documents(id) on delete set null,
  entity_id text references entities(id) on delete set null,
  report_type text not null default 'correction',
  message text not null,
  contributor_hash text,
  status submission_status not null default 'new',
  created_at timestamptz not null default now()
);

create table hallucination_reports (
  id uuid primary key default gen_random_uuid(),
  document_id text references documents(id) on delete set null,
  entity_id text references entities(id) on delete set null,
  ai_service text not null,
  prompt text,
  ai_answer text,
  expected_correction text,
  contributor_hash text,
  status submission_status not null default 'new',
  created_at timestamptz not null default now()
);

create table verification_events (
  id uuid primary key default gen_random_uuid(),
  claim_id text not null references claims(id) on delete cascade,
  event_type verification_event_type not null,
  previous_status claim_status,
  new_status claim_status,
  previous_confidence confidence_level,
  new_confidence confidence_level,
  note text,
  contributor_hash text,
  created_at timestamptz not null default now()
);

create index verification_events_claim_id_idx on verification_events (claim_id);

create table listings (
  id text primary key,
  entity_id text not null references entities(id) on delete cascade,
  document_id text references documents(id) on delete set null,
  lang text not null,
  slug text not null,
  title text not null,
  summary text,
  status document_status not null default 'ai_draft',
  confidence confidence_level not null default 'low',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index listings_lang_slug_key on listings (lang, slug);
create index listings_entity_id_idx on listings (entity_id);

create table admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table admin_audit_events is 'Admin-only audit trail. Do not store raw IP addresses; use safe metadata such as hashed user-agent or contributor_hash only.';
comment on column admin_audit_events.metadata is 'Safe request/action metadata only. Raw IP addresses are forbidden.';

create index admin_audit_events_created_at_idx on admin_audit_events (created_at desc);

alter table edits enable row level security;
alter table reports enable row level security;
alter table hallucination_reports enable row level security;
alter table admin_audit_events enable row level security;

create policy edits_public_insert_only on edits for insert to anon with check (true);
create policy reports_public_insert_only on reports for insert to anon with check (true);
create policy hallucination_reports_public_insert_only on hallucination_reports for insert to anon with check (true);

-- No public SELECT policies are defined for edits, reports, or hallucination_reports.
-- No public SELECT policies are defined for admin_audit_events.
-- Never store raw IP addresses. Store contributor_hash only for submissions/events.

-- Core registry RLS: the public site reads these tables with the anon key, so
-- grant READ-only access scoped to human-approved content. All writes flow
-- through service-role API routes (service role bypasses RLS). Without this,
-- anon could INSERT/UPDATE/DELETE documents and claims directly.
alter table entities enable row level security;
alter table documents enable row level security;
alter table claims enable row level security;
alter table claim_sources enable row level security;
alter table verification_events enable row level security;
alter table listings enable row level security;

create policy documents_public_select on documents for select to anon
  using (status in ('published', 'verified'));

create policy entities_public_select on entities for select to anon
  using (true);

create policy claims_public_select on claims for select to anon
  using (exists (
    select 1 from documents d
    where d.id = claims.document_id
      and d.status in ('published', 'verified')
  ));

create policy claim_sources_public_select on claim_sources for select to anon
  using (exists (
    select 1 from claims c
    join documents d on d.id = c.document_id
    where c.id = claim_sources.claim_id
      and d.status in ('published', 'verified')
  ));

create policy verification_events_public_select on verification_events for select to anon
  using (exists (
    select 1 from claims c
    join documents d on d.id = c.document_id
    where c.id = verification_events.claim_id
      and d.status in ('published', 'verified')
  ));

create policy listings_public_select on listings for select to anon
  using (status in ('published', 'verified'));

-- topic_candidates: AI/user-generated knowledge candidates (NOT verified facts)
-- These are intake items that go through review before being promoted to real documents/claims.
create table topic_candidates (
  id             uuid primary key default gen_random_uuid(),
  status         text not null default 'new'
                 check (status in ('new','reviewing','approved','rejected','promoted','spam')),
  source         text not null default 'ai_generated'
                 check (source in ('ai_generated','user_suggested','admin_created')),
  lang           text not null default 'ko',
  title          text not null,
  slug           text not null unique,
  category       text not null,
  subcategory    text,
  risk_tier      text not null default 'medium'
                 check (risk_tier in ('low','medium','high','forbidden')),
  why_people_ask_ai  text,
  why_ai_gets_wrong  text,
  claims         jsonb not null default '[]',
  source_hints   jsonb default '[]',
  contributor_hash text,
  generation_model text,
  consensus_score  numeric(3,2),
  consensus_level  text check (consensus_level in ('unanimous','majority','minority','single')),
  agreed_providers text[],
  created_at     timestamptz default now(),
  reviewed_at    timestamptz,
  promoted_at    timestamptz
);

create index topic_candidates_status_idx   on topic_candidates(status);
create index topic_candidates_category_idx on topic_candidates(category);
create index topic_candidates_created_idx  on topic_candidates(created_at desc);

alter table topic_candidates enable row level security;

-- Only allow public anon insert for user_suggested candidates with status 'new'.
-- AI-generated candidates require service_role key (not anon).
create policy topic_candidates_public_insert
  on topic_candidates for insert to anon
  with check (source = 'user_suggested' and status = 'new');

-- Admin review pipeline: allow anon SELECT (candidate metadata is not sensitive).
-- UPDATE is NOT granted to anon — candidate review/approve/promote runs through
-- service-role API routes (/api/admin/*) gated by x-admin-secret. Granting anon
-- UPDATE here would let any unauthenticated caller self-approve a candidate.
create policy topic_candidates_public_select
  on topic_candidates for select to anon
  using (true);

-- community_posts: users, AI (aiai), and admins can all leave posts.
create table community_posts (
  id              uuid primary key default gen_random_uuid(),
  document_id     text references documents(id) on delete set null,
  author_type     text not null default 'user'
                  check (author_type in ('user', 'ai', 'admin')),
  author_name     text not null default '익명',
  content         text not null,
  contributor_hash text,
  status          text not null default 'published'
                  check (status in ('published', 'hidden', 'spam', 'deleted')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index community_posts_document_id_idx on community_posts(document_id);
create index community_posts_status_idx      on community_posts(status);
create index community_posts_created_idx     on community_posts(created_at desc);
create index community_posts_author_type_idx on community_posts(author_type);

alter table community_posts enable row level security;

create policy community_posts_public_insert
  on community_posts for insert to anon
  with check (status = 'published' and author_type in ('user', 'ai'));

create policy community_posts_public_select
  on community_posts for select to anon
  using (status = 'published');

-- document_stats: track view_count and ai_citation_count per document.
create table document_stats (
  document_id       text primary key references documents(id) on delete cascade,
  view_count        bigint not null default 0,
  ai_citation_count bigint not null default 0,
  updated_at        timestamptz not null default now()
);

alter table document_stats enable row level security;

-- Anon may read counters; writes are server-side only. The view/cite endpoints
-- increment counters with the service-role key, so no anon INSERT/UPDATE policy
-- is granted (which would otherwise let anyone overwrite any document's counts).
create policy document_stats_public_select
  on document_stats for select to anon
  using (true);

-- Public topic suggestions are private intake submissions, not publishable facts.
create table if not exists topic_suggestions (
  id uuid primary key default gen_random_uuid(),
  contributor_hash text not null,
  submitted_at timestamptz not null default now(),
  question text not null,
  category text not null,
  reason text not null,
  related_url text,
  source_url text,
  status submission_status not null default 'new',
  reviewed_by text,
  reviewed_at timestamptz
);

alter table topic_suggestions enable row level security;
create policy topic_suggestions_public_insert_only on topic_suggestions for insert to anon with check (status = 'new');
-- No public SELECT policy: suggestions are write-only and admin-reviewed.
