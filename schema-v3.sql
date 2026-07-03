-- For-Ai schema v3
-- Source of truth for the For-Ai global fact registry.
-- The canonical claim-level structure is:
-- entities -> documents -> claims -> claim_sources -> verification_events

create extension if not exists pgcrypto;
create extension if not exists vector;

create type confidence_level as enum ('low', 'medium', 'high');
create type document_status as enum ('ai_draft', 'needs_review', 'verified', 'published', 'archived');
create type claim_status as enum ('needs_review', 'verified', 'disputed', 'unknown');
create type source_type as enum ('official', 'law', 'regulator', 'platform', 'review', 'user', 'phone', 'photo', 'document', 'web', 'other', 'unknown');
create type admin_role as enum ('viewer', 'editor', 'verifier', 'moderator', 'admin');
create type risk_tier as enum ('low', 'medium', 'high', 'forbidden');
create type update_frequency as enum ('realtime', 'daily', 'weekly', 'monthly', 'quarterly', 'annual', 'event_based', 'static');
create type disclaimer_type as enum ('none', 'check_official_source', 'not_medical_advice', 'not_financial_advice', 'not_legal_advice', 'not_genetic_or_medical_advice', 'public_profile_only', 'realtime_data_required');
create type source_authority as enum ('primary', 'official', 'regulator', 'legal', 'platform', 'secondary', 'community', 'unknown');
create type translation_status as enum ('source_language', 'human_translated', 'machine_translated', 'needs_translation_review', 'needs_human_translation_review');
create type submission_status as enum ('new', 'reviewing', 'accepted', 'rejected', 'spam', 'spam_suspected');
create type verification_event_type as enum ('created', 'reviewed', 'source_added', 'source_removed', 'source_verified', 'status_changed', 'confidence_changed');
create type notification_preference as enum ('none', 'in_app', 'email_digest', 'webhook');
create type watch_event_type as enum ('claim_stale', 'source_update_needed', 'verified_fix');
create type mission_status as enum ('open', 'in_progress', 'resolved', 'expired');
create type reward_badge as enum ('stale_claim_fixer', 'source_updater', 'topic_steward');

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
  region text,
  city text,
  jurisdiction text not null default 'GLOBAL',
  canonical_slug text not null,
  title text not null,
  localized_title jsonb not null default '{}'::jsonb,
  category text not null,
  template text not null,
  status document_status not null default 'ai_draft',
  confidence confidence_level not null default 'low',
  risk_tier risk_tier not null default 'low',
  update_frequency update_frequency not null default 'event_based',
  disclaimer_type disclaimer_type not null default 'check_official_source',
  translation_status translation_status not null default 'source_language',
  last_verified_at timestamptz,
  license_code text not null default 'forai-data-license-v0.1',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint documents_entity_id_required check (length(entity_id) > 0),
  constraint documents_slug_required check (length(slug) > 0),
  constraint documents_canonical_slug_required check (length(canonical_slug) > 0),
  constraint documents_high_risk_disclaimer_required check (risk_tier <> 'high' or disclaimer_type <> 'none'),
  constraint documents_lang_required check (length(lang) > 0),
  constraint documents_country_required check (length(country) > 0),
  constraint documents_license_not_cc_by_sa check (license_code <> 'CC-BY-SA')
);

comment on column documents.data is 'Rendering convenience only. Canonical facts must exist as claims.';

create unique index documents_country_lang_slug_key on documents (country, lang, slug);
create unique index documents_canonical_slug_lang_key on documents (canonical_slug, lang);
create unique index documents_entity_lang_template_key on documents (entity_id, lang, template);

create table claims (
  id text primary key,
  document_id text not null references documents(id) on delete cascade,
  entity_id text not null references entities(id) on delete restrict,
  field_path text not null,
  claim_text text not null,
  claim_value text not null,
  jurisdiction text not null default 'GLOBAL',
  country text not null default 'GLOBAL',
  region text,
  city text,
  risk_tier risk_tier not null default 'low',
  update_frequency update_frequency not null default 'event_based',
  disclaimer_type disclaimer_type not null default 'check_official_source',
  lang text not null default 'en',
  original_claim_id text references claims(id) on delete restrict,
  translation_status translation_status,
  confidence confidence_level not null default 'low',
  status claim_status not null default 'needs_review',
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint claims_entity_id_required check (length(entity_id) > 0),
  constraint claims_field_path_required check (length(field_path) > 0),
  constraint claims_lang_required check (length(lang) > 0),
  constraint claims_country_required check (length(country) > 0),
  constraint claims_jurisdiction_required check (length(jurisdiction) > 0),
  constraint claims_high_risk_disclaimer_required check (risk_tier <> 'high' or disclaimer_type <> 'none'),
  constraint translated_claims_link_to_original check (
    translation_status is null or original_claim_id is not null
  )
);

create index claims_document_id_idx on claims (document_id);
create index claims_entity_id_idx on claims (entity_id);
create index claims_original_claim_id_idx on claims (original_claim_id);
create index claims_jurisdiction_idx on claims (jurisdiction);
create index claims_risk_tier_idx on claims (risk_tier);
create unique index claims_document_field_path_key on claims (document_id, field_path);

-- Embeddings are auxiliary duplicate-discovery signals, not canonical facts.
-- They intentionally live outside documents.data and outside canonical claim values.
-- Enable pgvector in deployments that run ANN indexes:
-- create extension if not exists vector;
create table claim_embeddings (
  claim_id text primary key references claims(id) on delete cascade,
  embedding_model text not null,
  embedding_text text not null,
  embedding vector(1536) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table claim_embeddings is 'Auxiliary semantic index for duplicate review. Embeddings must never be treated as canonical claim_value or verification evidence.';
comment on column claim_embeddings.embedding_text is 'Derived text used for embedding; safe to regenerate and not canonical factual truth.';
create index claim_embeddings_embedding_idx on claim_embeddings using ivfflat (embedding vector_cosine_ops);

create table document_embeddings (
  document_id text primary key references documents(id) on delete cascade,
  embedding_model text not null,
  embedding_text text not null,
  embedding vector(1536) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table document_embeddings is 'Auxiliary document-level semantic index for candidate/document duplicate review only.';
create index document_embeddings_embedding_idx on document_embeddings using ivfflat (embedding vector_cosine_ops);

create table claim_sources (
  id text primary key,
  claim_id text not null references claims(id) on delete cascade,
  source_type source_type not null default 'unknown',
  source_authority source_authority not null default 'unknown',
  title text,
  url text,
  source_domain text,
  detected_language text,
  page_type text,
  citation text,
  lang text,
  observed_at timestamptz,
  source_check_status text not null default 'unchecked' check (source_check_status in ('unchecked', 'passed', 'warning', 'failed')),
  source_trust_score integer not null default 0 check (source_trust_score >= 0 and source_trust_score <= 100),
  source_check_notes text,
  contributor_hash text,
  created_at timestamptz not null default now()
);

comment on column documents.slug is 'Canonical stable English slug shared across locale routes.';
comment on column documents.title is 'Locale-specific display title; do not use as canonical identity.';
comment on column claims.lang is 'Language of this claim text/value.';
comment on column claims.original_claim_id is 'For translated claims, references the original source-language claim.';
comment on column claims.translation_status is 'machine_translated for aligned candidates; needs_human_translation_review when semantic similarity is low, claim_value/field_path/jurisdiction/country conflicts, or high-risk content awaits human translation review; human_translated after approval.';
comment on column claim_sources.lang is 'Original language of the source; preserve instead of translating source identity.';
comment on column claim_sources.source_domain is 'Normalized/extracted domain used only for review aids such as recommended source type; not canonical factual evidence.';
comment on column claim_sources.detected_language is 'Detected source page language for review context; does not prove claim truth.';
comment on column claim_sources.page_type is 'Detected page type for classifier input; must not auto-create verification_events or change confidence.';

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
  review_priority_score integer not null default 0 check (review_priority_score >= 0 and review_priority_score <= 100),
  review_priority_reason text,
  model_version text not null default 'rule-based-v1',
  claim_id text references claims(id) on delete set null,
  wrong_answer_type text,
  correction_prompt text,
  share_card jsonb not null default '{}'::jsonb,
  moderation_note text,
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

create index hallucination_reports_claim_id_idx on hallucination_reports (claim_id);
create index hallucination_reports_status_idx on hallucination_reports (status);
create index hallucination_reports_review_priority_idx on hallucination_reports (review_priority_score desc, created_at asc);

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

create table admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role admin_role not null default 'viewer',
  active boolean not null default true,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references admin_users(user_id) on delete set null,
  admin_user_hash text not null,
  action text not null,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint admin_audit_no_raw_request_metadata check (
    not (metadata ?| array['ip', 'raw_ip', 'client_ip', 'x_forwarded_for', 'x_real_ip', 'user_agent', 'raw_user_agent'])
  )
);

comment on table admin_users is 'Admin authorization table mapped to Supabase Auth users. Service-role admin APIs enforce these roles.';
comment on table admin_audit_events is 'Admin-only audit trail. Do not store raw IP addresses; use admin_user_id/admin_user_hash and safe metadata only.';
comment on column admin_audit_events.admin_user_hash is 'SHA-256 hash of the admin identity or emergency ADMIN_SECRET fallback identity; never a raw IP address.';
comment on column admin_audit_events.metadata is 'Safe request/action metadata only. Raw IP addresses and raw user-agent strings are forbidden; store only hashes or non-identifying action fields.';

create index admin_users_role_idx on admin_users (role);
create index admin_audit_events_created_at_idx on admin_audit_events (created_at desc);
create index admin_audit_events_admin_user_id_idx on admin_audit_events (admin_user_id);
create index admin_audit_events_target_id_idx on admin_audit_events (target_id);

alter table edits enable row level security;
alter table reports enable row level security;
alter table hallucination_reports enable row level security;
alter table admin_users enable row level security;
alter table admin_audit_events enable row level security;

create policy edits_public_insert_only on edits for insert to anon with check (status = 'new');
create policy reports_public_insert_only on reports for insert to anon with check (status = 'new');
create policy hallucination_reports_public_insert_only on hallucination_reports for insert to anon with check (status = 'new');

-- No public SELECT policies are defined for edits, reports, or hallucination_reports.
-- No public SELECT policies are defined for admin_users or admin_audit_events.
-- Never store raw IP addresses. Store contributor_hash only for submissions/events.

-- Core registry RLS: the public site reads these tables with the anon key, so
-- grant READ-only access scoped to human-approved content. All writes flow
-- through service-role API routes (service role bypasses RLS). Without this,
-- anon could INSERT/UPDATE/DELETE documents and claims directly.
alter table entities enable row level security;
alter table documents enable row level security;
alter table claims enable row level security;
alter table claim_embeddings enable row level security;
alter table document_embeddings enable row level security;
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
                 check (status in ('new','reviewing','approved','rejected','promoted','spam','spam_suspected')),
  source         text not null default 'ai_generated'
                 check (source in ('ai_generated','user_suggested','admin_created')),
  lang           text not null default 'ko',
  country        text not null default 'global',
  title          text not null,
  slug           text not null unique,
  category       text not null,
  subcategory    text,
  region         text,
  city           text,
  canonical_slug text not null default '',
  localized_title jsonb not null default '{}'::jsonb,
  jurisdiction   text not null default 'GLOBAL',
  source_authority source_authority not null default 'unknown',
  translation_status translation_status not null default 'source_language',
  risk_tier      risk_tier not null default 'medium',
  update_frequency update_frequency not null default 'event_based',
  disclaimer_type disclaimer_type not null default 'check_official_source',
  why_people_ask_ai  text,
  why_ai_gets_wrong  text,
  claims         jsonb not null default '[]',
  source_hints   jsonb default '[]',
  contributor_hash text,
  generation_model text,
  generation_run_id uuid,
  consensus_score  numeric(3,2),
  consensus_level  text check (consensus_level in ('unanimous','majority','minority','single')),
  agreed_providers text[],
  review_priority_score integer not null default 0 check (review_priority_score >= 0 and review_priority_score <= 100),
  review_priority_reason text,
  model_version text not null default 'rule-based-v1',
  created_at     timestamptz default now(),
  reviewed_at    timestamptz,
  promoted_at    timestamptz
);

create index topic_candidates_country_idx  on topic_candidates(country);
create index topic_candidates_status_idx   on topic_candidates(status);
create index topic_candidates_category_idx on topic_candidates(category);
create index topic_candidates_created_idx  on topic_candidates(created_at desc);
create index topic_candidates_generation_run_idx on topic_candidates(generation_run_id);
create index topic_candidates_review_priority_idx on topic_candidates(review_priority_score desc, created_at asc);


-- candidate_generation_runs: admin-only AI generation run records for reuse,
-- provider cost/success telemetry, and accepted/promoted ratios.
create table candidate_generation_runs (
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
  add constraint topic_candidates_generation_run_id_fkey
  foreign key (generation_run_id) references candidate_generation_runs(id) on delete set null;

create index candidate_generation_runs_created_idx on candidate_generation_runs(created_at desc);
alter table candidate_generation_runs enable row level security;


create table topic_candidate_embeddings (
  topic_candidate_id uuid primary key references topic_candidates(id) on delete cascade,
  embedding_model text not null,
  embedding_text text not null,
  embedding vector(1536) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table topic_candidate_embeddings is 'Auxiliary embedding for topic_candidates title + slug + category + claims.question. Used only to raise possible_duplicate review signals.';
create index topic_candidate_embeddings_embedding_idx on topic_candidate_embeddings using ivfflat (embedding vector_cosine_ops);

create table topic_candidate_claim_links (
  id uuid primary key default gen_random_uuid(),
  topic_candidate_id uuid not null references topic_candidates(id) on delete cascade,
  claim_index integer not null check (claim_index >= 0),
  original_claim_id text references claims(id) on delete restrict,
  review_status text not null default 'pending' check (review_status in ('pending','accepted','rejected')),
  similarity_score numeric(5,4),
  reviewer_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (topic_candidate_id, claim_index, original_claim_id)
);

comment on table topic_candidate_claim_links is 'Review workflow for multilingual or duplicate candidate claims that may point to the same original claim. Acceptance can populate claims.original_claim_id after human review.';
comment on column topic_candidate_claim_links.original_claim_id is 'Existing source-language claim that the candidate claim may translate or restate; never auto-accepted from embedding similarity alone.';
create index topic_candidate_claim_links_original_claim_idx on topic_candidate_claim_links(original_claim_id);


create table possible_duplicate_reviews (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('topic_candidate','document','claim','source_candidate')),
  subject_id text not null,
  matched_type text not null check (matched_type in ('topic_candidate','document','claim','source_candidate')),
  matched_id text not null,
  signal_type text not null check (signal_type in ('slug','title','embedding')),
  similarity_score numeric(5,4) not null check (similarity_score >= 0 and similarity_score <= 1),
  review_status text not null default 'pending' check (review_status in ('pending','duplicate','not_duplicate','linked_translation','ignored')),
  reviewer_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (subject_type, subject_id, matched_type, matched_id, signal_type)
);

comment on table possible_duplicate_reviews is 'Admin review queue for duplicate signals. Embedding matches create possible_duplicate signals only and must not auto-merge candidates, documents, claims, or sources.';
create index possible_duplicate_reviews_subject_idx on possible_duplicate_reviews(subject_type, subject_id, review_status);
create index possible_duplicate_reviews_matched_idx on possible_duplicate_reviews(matched_type, matched_id, review_status);

alter table topic_candidates enable row level security;
alter table topic_candidate_embeddings enable row level security;
alter table topic_candidate_claim_links enable row level security;
alter table possible_duplicate_reviews enable row level security;

-- Only allow public anon insert for user_suggested candidates awaiting admin review.
-- AI-generated candidates require service_role key (not anon).
create policy topic_candidates_public_insert
  on topic_candidates for insert to anon
  with check (source = 'user_suggested' and status in ('new', 'spam_suspected'));

-- No public SELECT/UPDATE policies: topic candidates are review-queue
-- intake records and are readable only through admin/service-role API routes
-- (/api/admin/*) gated by x-admin-secret.

-- community_posts: public users can submit user posts; AI/admin posts are service-role only.
create table community_posts (
  id              uuid primary key default gen_random_uuid(),
  document_id     text references documents(id) on delete set null,
  claim_id        text references claims(id) on delete set null,
  author_type     text not null default 'user'
                  check (author_type in ('user', 'ai', 'admin')),
  author_name     text not null default '익명',
  content         text not null,
  contributor_hash text,
  status          text not null default 'published'
                  check (status in ('pending', 'published', 'hidden', 'spam', 'deleted')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index community_posts_document_id_idx on community_posts(document_id);
create index community_posts_claim_id_idx    on community_posts(claim_id);
create index community_posts_status_idx      on community_posts(status);
create index community_posts_created_idx     on community_posts(created_at desc);
create index community_posts_author_type_idx on community_posts(author_type);

alter table community_posts enable row level security;

create policy community_posts_public_insert
  on community_posts for insert to anon
  with check (status = 'pending' and author_type = 'user');

create policy community_posts_public_select
  on community_posts for select to anon
  using (status = 'published');

-- document_stats: track view_count and ai_citation_count per document.
create table document_stats (
  document_id             text primary key references documents(id) on delete cascade,
  view_count              bigint not null default 0,
  ai_citation_count       bigint not null default 0,
  human_view_count        bigint not null default 0,
  bot_view_count          bigint not null default 0,
  ai_crawler_view_count   bigint not null default 0,
  api_cite_count          bigint not null default 0,
  citation_copy_count     bigint not null default 0,
  report_submission_count bigint not null default 0,
  updated_at              timestamptz not null default now()
);

alter table document_stats enable row level security;

-- Anon may read counters; writes are server-side only. The view/cite endpoints
-- increment counters with the service-role key, so no anon INSERT/UPDATE policy
-- is granted (which would otherwise let anyone overwrite any document's counts).
create policy document_stats_public_select
  on document_stats for select to anon
  using (true);

-- document_read_events: privacy-safe detailed analytics for slug-level aggregates.
create table document_read_events (
  id              uuid primary key default gen_random_uuid(),
  document_id     text not null references documents(id) on delete cascade,
  event_type      text not null check (event_type in ('read','api_cite','citation_copy','report_submission')),
  actor_type      text not null check (actor_type in ('human','bot','ai_crawler')),
  crawler_name    text,
  visitor_hash    text,
  user_agent_hash text,
  created_at      timestamptz not null default now()
);

comment on table document_read_events is 'Privacy-safe read/citation analytics. Never store raw IP addresses; store contributor-style visitor_hash only.';
comment on column document_read_events.visitor_hash is 'Salted non-raw visitor identifier derived from request IP when available; raw IP is forbidden.';
comment on column document_read_events.user_agent_hash is 'Hashed user-agent for coarse duplicate/debug analysis without storing raw user-agent text.';

create index document_read_events_document_created_idx on document_read_events (document_id, created_at desc);
create index document_read_events_type_actor_idx on document_read_events (event_type, actor_type);

alter table document_read_events enable row level security;

-- Public topic suggestions are private intake submissions, not publishable facts.
create table if not exists topic_suggestions (
  id uuid primary key default gen_random_uuid(),
  contributor_hash text not null,
  submitted_at timestamptz not null default now(),
  question text not null,
  country text,
  city_region text,
  category text not null,
  language text not null default 'en',
  reason text not null,
  related_url text,
  source_url text,
  contact_email text,
  status submission_status not null default 'new',
  reviewed_by text,
  reviewed_at timestamptz
);

create index topic_suggestions_status_submitted_idx on topic_suggestions(status, submitted_at desc);

alter table topic_suggestions enable row level security;
create policy topic_suggestions_public_insert_only on topic_suggestions for insert to anon with check (status in ('new', 'spam_suspected'));
-- No public SELECT policy: suggestions are write-only and admin-reviewed.

-- topic_adoptions: a contributor opts into stewardship for a topic slice.
-- Adoption is scoped by the canonical registry axes (entity/document plus
-- category/country). Anonymous public users are represented by contributor_hash;
-- authenticated contributors may additionally use contributor_id.
create table topic_adoptions (
  id uuid primary key default gen_random_uuid(),
  contributor_id uuid references auth.users(id) on delete set null,
  contributor_hash text,
  entity_id text references entities(id) on delete cascade,
  document_id text references documents(id) on delete cascade,
  category text,
  country text not null default 'GLOBAL',
  notification_preference notification_preference not null default 'in_app',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint topic_adoptions_contributor_required check (
    contributor_id is not null or length(coalesce(contributor_hash, '')) > 0
  ),
  constraint topic_adoptions_scope_required check (
    entity_id is not null or document_id is not null or length(coalesce(category, '')) > 0 or length(country) > 0
  )
);

comment on table topic_adoptions is 'Contributor stewardship intent for a topic/country/category/entity/document slice. Never store raw IP addresses; use contributor_hash for anonymous contributors.';
comment on column topic_adoptions.contributor_hash is 'Salted contributor identifier only. Raw IP addresses are forbidden.';
comment on column topic_adoptions.entity_id is 'Optional canonical entity scope; entity_id remains mandatory for factual claims themselves.';
comment on column topic_adoptions.document_id is 'Optional document scope used to match stale claims and source-update missions.';

create index topic_adoptions_contributor_id_idx on topic_adoptions(contributor_id) where contributor_id is not null;
create index topic_adoptions_contributor_hash_idx on topic_adoptions(contributor_hash) where contributor_hash is not null;
create index topic_adoptions_entity_id_idx on topic_adoptions(entity_id) where entity_id is not null;
create index topic_adoptions_document_id_idx on topic_adoptions(document_id) where document_id is not null;
create index topic_adoptions_category_country_idx on topic_adoptions(category, country) where active = true;
create unique index topic_adoptions_unique_hash_scope
  on topic_adoptions(coalesce(contributor_hash, ''), coalesce(entity_id, ''), coalesce(document_id, ''), coalesce(category, ''), country)
  where contributor_id is null and active = true;
create unique index topic_adoptions_unique_user_scope
  on topic_adoptions(contributor_id, coalesce(entity_id, ''), coalesce(document_id, ''), coalesce(category, ''), country)
  where contributor_id is not null and active = true;

alter table topic_adoptions enable row level security;

-- Public users may adopt topics without login, but only through privacy-safe
-- contributor_hash values. No public SELECT policy is granted because watch
-- intent can reveal private contributor interests.
create policy topic_adoptions_public_insert
  on topic_adoptions for insert to anon
  with check (
    contributor_id is null
    and length(coalesce(contributor_hash, '')) > 0
    and notification_preference in ('none', 'in_app')
  );

-- watch_subscriptions: event delivery and mission state derived from adoptions.
-- When a claim becomes stale or a source needs re-checking, service-role jobs
-- create/update rows here and can notify matching adopters. Verified fixes can
-- resolve the mission and record the awarded badge/points.
create table watch_subscriptions (
  id uuid primary key default gen_random_uuid(),
  topic_adoption_id uuid references topic_adoptions(id) on delete cascade,
  contributor_id uuid references auth.users(id) on delete set null,
  contributor_hash text,
  entity_id text references entities(id) on delete cascade,
  document_id text references documents(id) on delete cascade,
  claim_id text references claims(id) on delete cascade,
  category text,
  country text not null default 'GLOBAL',
  event_type watch_event_type not null,
  notification_preference notification_preference not null default 'in_app',
  mission_status mission_status not null default 'open',
  source_update_needed boolean not null default false,
  notification_sent_at timestamptz,
  mission_created_at timestamptz,
  resolved_at timestamptz,
  resolved_by_contributor_hash text,
  awarded_badge reward_badge,
  awarded_points integer not null default 0 check (awarded_points >= 0),
  created_at timestamptz not null default now(),
  constraint watch_subscriptions_contributor_required check (
    contributor_id is not null or length(coalesce(contributor_hash, '')) > 0
  ),
  constraint watch_subscriptions_scope_required check (
    entity_id is not null or document_id is not null or claim_id is not null or length(coalesce(category, '')) > 0 or length(country) > 0
  ),
  constraint watch_subscriptions_mission_timestamp check (
    mission_status = 'open' or mission_created_at is not null
  ),
  constraint watch_subscriptions_reward_requires_verified_fix check (
    (awarded_badge is null and awarded_points = 0)
    or (event_type = 'verified_fix' and mission_status = 'resolved' and resolved_at is not null)
  )
);

comment on table watch_subscriptions is 'Private watch queue for stale-claim alerts, source-update missions, and verified-fix rewards derived from topic_adoptions.';
comment on column watch_subscriptions.source_update_needed is 'True when a stale/changed source should be shown as a contributor mission.';
comment on column watch_subscriptions.awarded_points is 'Points granted only after a human-approved verified fix.';
comment on column watch_subscriptions.resolved_by_contributor_hash is 'Privacy-safe contributor hash for the fixer; raw IP addresses are forbidden.';

create index watch_subscriptions_adoption_idx on watch_subscriptions(topic_adoption_id) where topic_adoption_id is not null;
create index watch_subscriptions_contributor_id_idx on watch_subscriptions(contributor_id) where contributor_id is not null;
create index watch_subscriptions_contributor_hash_idx on watch_subscriptions(contributor_hash) where contributor_hash is not null;
create index watch_subscriptions_claim_event_idx on watch_subscriptions(claim_id, event_type);
create index watch_subscriptions_document_status_idx on watch_subscriptions(document_id, mission_status);
create index watch_subscriptions_category_country_idx on watch_subscriptions(category, country, mission_status);
create index watch_subscriptions_notification_due_idx on watch_subscriptions(notification_preference, notification_sent_at) where mission_status in ('open', 'in_progress');

alter table watch_subscriptions enable row level security;

-- No public SELECT/UPDATE policies: watch rows can expose contributor interests,
-- notification preferences, and reward history. Service-role API routes/jobs own
-- subscription matching, notifications, mission transitions, and reward grants.


-- Source contribution system for public source candidates.
-- Points reward contribution activity only; points never determine claim truth.
-- Single canonical definition: identity/point columns and privacy-preserving
-- streak columns live on one table keyed by id, with contributor_hash unique
-- so both uuid and hash foreign keys remain valid.

create table if not exists contributors (
  id uuid primary key default gen_random_uuid(),
  contributor_hash text unique,
  account_id uuid references auth.users(id) on delete set null,
  display_name text,
  total_points integer not null default 0 check (total_points >= 0),
  accepted_source_count integer not null default 0 check (accepted_source_count >= 0),
  verified_claim_link_count integer not null default 0 check (verified_claim_link_count >= 0),
  spam_submission_count integer not null default 0 check (spam_submission_count >= 0),
  visit_streak_points bigint not null default 0,
  submission_streak_points bigint not null default 0,
  accepted_streak_points bigint not null default 0,
  verified_source_leaderboard_score bigint not null default 0,
  badges text[] not null default '{}',
  last_streak_calculated_at timestamptz,
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
  source_domain text,
  detected_language text,
  page_type text,
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
  review_priority_score integer not null default 0 check (review_priority_score >= 0 and review_priority_score <= 100),
  review_priority_reason text,
  model_version text not null default 'rule-based-v1',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text,
  linked_claim_source_id text references claim_sources(id) on delete set null,
  constraint source_candidate_has_source check (url is not null or citation is not null or title is not null)
);

comment on table source_candidates is 'Unverified public source candidates. Human review is required before attaching to claim_sources or changing claim verification status.';
comment on column source_candidates.points_awarded is 'Contribution reward only; must not be used to decide claim truth, confidence, or verified status.';
comment on column source_candidates.source_type is 'Submitted/candidate source type. Classifier output may be displayed as recommended source type only; it must not auto-promote to claim_sources or verification_events.';
comment on column source_candidates.source_domain is 'Normalized/extracted domain used as classifier input for recommended source type display only.';
comment on column source_candidates.detected_language is 'Detected source page language used as classifier input for reviewer context only.';
comment on column source_candidates.page_type is 'Detected page type used as classifier input for recommended source type display only.';

-- Review priority scores are queue-management signals only. They are not
-- canonical truth and must never directly change claims.confidence,
-- claims.status, documents.confidence, documents.status, claim_sources, or
-- verification_events. Only human-approved verification workflows may change
-- canonical claim confidence or verification status.
comment on column hallucination_reports.review_priority_score is 'Auxiliary review-queue score from source presence, risk tier, domain volatility, consensus level, and user demand only. Not canonical truth; must not change claim confidence or verification status directly.';
comment on column hallucination_reports.review_priority_reason is 'Human-readable explanation for the auxiliary review priority score; not verification evidence.';
comment on column hallucination_reports.model_version is 'Scoring model identifier for review priority, starting with rule-based-v1 and replaceable by future ML models.';
comment on column topic_candidates.review_priority_score is 'Auxiliary review-queue score from source presence, risk tier, domain volatility, consensus level, and user demand only. Not canonical truth; must not change claim confidence or verification status directly.';
comment on column topic_candidates.review_priority_reason is 'Human-readable explanation for the auxiliary review priority score; not verification evidence.';
comment on column topic_candidates.model_version is 'Scoring model identifier for review priority, starting with rule-based-v1 and replaceable by future ML models.';
comment on column source_candidates.review_priority_score is 'Auxiliary review-queue score from source presence, risk tier, domain volatility, consensus level, and user demand only. Not canonical truth; must not change claim confidence or verification status directly.';
comment on column source_candidates.review_priority_reason is 'Human-readable explanation for the auxiliary review priority score; not verification evidence.';
comment on column source_candidates.model_version is 'Scoring model identifier for review priority, starting with rule-based-v1 and replaceable by future ML models.';

create table if not exists source_candidate_embeddings (
  source_candidate_id uuid primary key references source_candidates(id) on delete cascade,
  embedding_model text not null,
  embedding_text text not null,
  embedding vector(1536) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table source_candidate_embeddings is 'Auxiliary semantic index for finding duplicate source submissions. Human review is still required before linking sources.';
create index if not exists source_candidate_embeddings_embedding_idx on source_candidate_embeddings using ivfflat (embedding vector_cosine_ops);

-- contribution_events: single canonical reward/audit ledger for anonymous public
-- contributions. Rewards are derived only from these events. Verified claim and
-- document status still change only through admin-approved verification flows.
create table if not exists contribution_events (
  id uuid primary key default gen_random_uuid(),
  contributor_id uuid references contributors(id) on delete set null,
  contributor_hash text,
  account_id uuid references auth.users(id) on delete set null,
  source_candidate_id uuid references source_candidates(id) on delete set null,
  claim_id text references claims(id) on delete set null,
  document_id text references documents(id) on delete set null,
  hallucination_report_id uuid references hallucination_reports(id) on delete set null,
  event_type text not null check (event_type in (
    'source_submitted',
    'source_duplicate_submitted',
    'source_admin_accepted',
    'source_linked_verified_claim',
    'source_spam_rejected',
    'source_accepted',
    'claim_verified_from_contribution',
    'hallucination_report_accepted'
  )),
  points integer not null default 0 check (points >= 0),
  points_delta integer not null default 0 check (points_delta >= 0),
  country text,
  source_type source_type,
  submission_status submission_status,
  related_table text,
  related_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint contribution_event_identifier_required check (contributor_hash is not null or account_id is not null)
);

comment on table contribution_events is 'Audit trail and anonymous reward ledger for contribution activity. Does not determine factual truth. Never store raw IP addresses.';
comment on column contribution_events.metadata is 'Safe metadata only. Never include raw IP addresses or raw user-agent strings.';
comment on column contribution_events.contributor_hash is 'Salted contributor identifier only; raw IP addresses are forbidden.';
comment on column contribution_events.submission_status is 'Rejected/spam submissions may be recorded for audit context but must be ignored by streak calculation.';

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
create index if not exists source_candidates_review_priority_idx on source_candidates(review_priority_score desc, created_at asc);
create index if not exists source_candidate_embeddings_created_idx on source_candidate_embeddings(created_at desc);
create index if not exists contribution_events_contributor_idx on contribution_events(contributor_hash, created_at desc);
create index if not exists contribution_events_contributor_type_created_idx on contribution_events(contributor_hash, event_type, created_at desc);
create index if not exists contribution_events_type_created_idx on contribution_events(event_type, created_at desc);
create index if not exists contribution_events_country_idx on contribution_events(country);
create index if not exists contributor_points_contributor_idx on contributor_points(contributor_hash, created_at desc);

alter table contributors enable row level security;
alter table source_candidates enable row level security;
alter table source_candidate_embeddings enable row level security;
alter table contribution_events enable row level security;
alter table contributor_points enable row level security;

create policy source_candidates_public_insert_only
  on source_candidates for insert to anon
  with check (status in ('new', 'spam_suspected') and review_status = 'pending');

-- Public reads on contribution_events are limited to pseudonymous reward rows
-- (contributor_hash only, no raw identity or submission text) so leaderboards
-- can render with the anon key. No public INSERT/UPDATE: the ledger is written
-- by service-role routes/jobs only.
create policy contribution_events_public_select on contribution_events for select to anon using (true);

-- No public SELECT policies for source_candidates, contributors, or
-- contributor_points: private review/reputation data exposed only through
-- service-role APIs.




create type bounty_status as enum ('open', 'reviewing', 'awarded', 'closed');
create type bounty_sponsor_type as enum ('none', 'community', 'business', 'institution', 'platform', 'government', 'other');
create type bounty_submission_status as enum ('new', 'reviewing', 'accepted_source_candidate', 'rejected', 'spam', 'spam_suspected');

-- claim_bounties: public source-finding tasks for claims or topic candidates.
-- Bounty sponsorship never determines whether a claim is verified; verification
-- remains an independent human-reviewed source-backed workflow through claims,
-- claim_sources, and verification_events.
create table claim_bounties (
  bounty_id uuid primary key default gen_random_uuid(),
  claim_id text references claims(id) on delete cascade,
  topic_candidate_id uuid references topic_candidates(id) on delete cascade,
  title text not null,
  description text not null,
  country text not null default 'global',
  category text not null,
  reward_points integer not null default 0 check (reward_points >= 0),
  sponsor_type bounty_sponsor_type not null default 'none',
  sponsor_label text,
  status bounty_status not null default 'open',
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  constraint claim_bounties_exactly_one_target check (
    (claim_id is not null and topic_candidate_id is null)
    or (claim_id is null and topic_candidate_id is not null)
  ),
  constraint claim_bounties_sponsored_label_required check (
    sponsor_type = 'none' or nullif(trim(sponsor_label), '') is not null
  )
);

comment on table claim_bounties is 'Source-finding bounties for unverified claims or topic candidates. Sponsored bounties must be labeled; sponsorship does not affect verification.';
comment on column claim_bounties.sponsor_type is 'Sponsorship display category only. It must not be used as verification authority.';
comment on column claim_bounties.sponsor_label is 'Public sponsor label shown on sponsored bounties; never implies verified status.';

create index claim_bounties_claim_id_idx on claim_bounties(claim_id);
create index claim_bounties_topic_candidate_id_idx on claim_bounties(topic_candidate_id);
create index claim_bounties_status_created_idx on claim_bounties(status, created_at desc);
create index claim_bounties_country_category_idx on claim_bounties(country, category);

-- bounty_submissions: public contributors can submit source candidates only.
-- They cannot write claim_sources directly and cannot mark claims verified.
create table bounty_submissions (
  id uuid primary key default gen_random_uuid(),
  bounty_id uuid not null references claim_bounties(bounty_id) on delete cascade,
  submitted_source_url text,
  submitted_source_title text,
  submitted_citation text,
  submitted_source_type source_type not null default 'unknown',
  submitted_source_authority source_authority not null default 'unknown',
  source_observed_at timestamptz,
  contributor_hash text not null,
  reviewer_note text,
  accepted_claim_source_id text references claim_sources(id) on delete set null,
  reward_points_awarded integer not null default 0 check (reward_points_awarded >= 0),
  status bounty_submission_status not null default 'new',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint bounty_submissions_source_candidate_required check (
    nullif(trim(coalesce(submitted_source_url, '')), '') is not null
    or nullif(trim(coalesce(submitted_citation, '')), '') is not null
  )
);

comment on table bounty_submissions is 'Public source-candidate submissions for bounties. Contributors submit evidence only; admins/verifiers independently decide claim_sources and verification_events.';
comment on column bounty_submissions.contributor_hash is 'Salted non-raw contributor identifier. Never store raw IP addresses.';
comment on column bounty_submissions.accepted_claim_source_id is 'Set only after independent review converts the candidate into a claim_sources row; this does not by itself mark the claim verified.';

create index bounty_submissions_bounty_id_idx on bounty_submissions(bounty_id);
create index bounty_submissions_status_created_idx on bounty_submissions(status, created_at desc);
create index bounty_submissions_contributor_hash_idx on bounty_submissions(contributor_hash);

alter table claim_bounties enable row level security;
alter table bounty_submissions enable row level security;

create policy claim_bounties_public_select
  on claim_bounties for select to anon
  using (status in ('open', 'reviewing', 'awarded'));

create policy bounty_submissions_public_insert_only
  on bounty_submissions for insert to anon
  with check (
    status in ('new', 'spam_suspected')
    and contributor_hash is not null
    and accepted_claim_source_id is null
    and reward_points_awarded = 0
    and reviewed_at is null
  );

-- No public SELECT/UPDATE policies for bounty_submissions. Moderation and any
-- conversion into claim_sources/verification_events require service-role APIs.

-- NOTE: contributors and contribution_events are defined once, above, in the
-- source contribution section. Streak/reward columns live on those canonical
-- tables; do not redeclare them here.

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



-- Privacy/retention policy notes:
-- - Never persist raw IP addresses. Public contributors are identified only by contributor_hash.
-- - Raw user-agent strings are not stored in admin audit metadata; store a short salted/one-way hash or omit.
-- - Public intake submissions (edits, reports, hallucination_reports, topic_suggestions, topic_candidates) should be reviewed and deleted/anonymized within 180 days after final status, unless retained as accepted claim provenance.
-- - Inactive topic_adoptions and resolved watch_subscriptions should be anonymized or aggregated after 365 days unless needed for contributor reward accounting.
-- - Admin audit events should be retained for 365 days, then deleted or aggregated.
