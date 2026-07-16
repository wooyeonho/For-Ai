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
create type hallucination_match_target_type as enum ('claim', 'topic_candidate');

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
  review_priority_score numeric(6,2) not null default 0,
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
  extracted_entity_text text,
  extracted_domain text,
  extracted_claim_like_phrase text,
  report_embedding jsonb,
  pii_redaction_status text not null default 'pending'
    check (pii_redaction_status in ('pending', 'redacted', 'not_needed', 'purged')),
  raw_text_expires_at timestamptz,
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
create index hallucination_reports_extracted_domain_idx on hallucination_reports (extracted_domain);
create index hallucination_reports_raw_text_expires_idx on hallucination_reports (raw_text_expires_at);

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

-- hallucination_report_clusters: admin-only clustering hints derived from
-- hallucination_reports/reports text. Clusters and matches are review signals,
-- not canonical facts, and must never update claims automatically.
create table hallucination_report_clusters (
  id uuid primary key default gen_random_uuid(),
  cluster_key text not null unique,
  entity_id text references entities(id) on delete set null,
  domain text not null default 'unknown',
  claim_like_phrase text not null,
  report_count integer not null default 0 check (report_count >= 0),
  repeated_signal_score numeric(6,2) not null default 0,
  review_priority_score numeric(6,2) not null default 0,
  status submission_status not null default 'new',
  extraction_metadata jsonb not null default '{}'::jsonb,
  retention_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table hallucination_report_cluster_members (
  cluster_id uuid not null references hallucination_report_clusters(id) on delete cascade,
  hallucination_report_id uuid references hallucination_reports(id) on delete cascade,
  report_id uuid references reports(id) on delete cascade,
  normalized_text_hash text not null,
  created_at timestamptz not null default now(),
  primary key (cluster_id, normalized_text_hash),
  constraint hallucination_cluster_member_one_source check (
    (hallucination_report_id is not null and report_id is null)
    or (hallucination_report_id is null and report_id is not null)
  )
);

create table hallucination_report_possible_matches (
  id uuid primary key default gen_random_uuid(),
  cluster_id uuid not null references hallucination_report_clusters(id) on delete cascade,
  target_type hallucination_match_target_type not null,
  claim_id text references claims(id) on delete cascade,
  topic_candidate_id uuid references topic_candidates(id) on delete cascade,
  similarity_score numeric(5,4) not null check (similarity_score >= 0 and similarity_score <= 1),
  match_reason text not null,
  review_status submission_status not null default 'new',
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint hallucination_possible_match_one_target check (
    (target_type = 'claim' and claim_id is not null and topic_candidate_id is null)
    or (target_type = 'topic_candidate' and topic_candidate_id is not null and claim_id is null)
  )
);

comment on table hallucination_report_clusters is 'Admin-only clustering hints from user report text. Repeated reports may raise review priority but must not modify claims automatically.';
comment on table hallucination_report_possible_matches is 'Possible matches to existing claims or topic_candidates shown only in admin review queues; human review is required before any claim/source change.';
comment on column hallucination_reports.report_embedding is 'Embedding payload for similarity search metadata only; do not expose publicly and purge with raw report text retention.';
comment on column hallucination_reports.raw_text_expires_at is 'Deadline for deleting or anonymizing raw prompt/answer/correction text because it may contain personal data.';

create index hallucination_clusters_entity_idx on hallucination_report_clusters(entity_id);
create index hallucination_clusters_priority_idx on hallucination_report_clusters(review_priority_score desc, report_count desc);
create index hallucination_cluster_members_hreport_idx on hallucination_report_cluster_members(hallucination_report_id);
create index hallucination_cluster_members_report_idx on hallucination_report_cluster_members(report_id);
create index hallucination_possible_matches_cluster_idx on hallucination_report_possible_matches(cluster_id);
create index hallucination_possible_matches_claim_idx on hallucination_report_possible_matches(claim_id);
create index hallucination_possible_matches_topic_candidate_idx on hallucination_report_possible_matches(topic_candidate_id);

alter table hallucination_report_clusters enable row level security;
alter table hallucination_report_cluster_members enable row level security;
alter table hallucination_report_possible_matches enable row level security;
-- No public SELECT/INSERT policies: clustering, embeddings, and possible matches
-- are service-role/admin-only because they are derived from private report text.

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





-- =============================================================================
-- Task 5-0: structural foundation (added 2026-07-16)
-- Mirrors supabase/migrations/20260716120955_task5_structural_foundation.sql exactly.
-- NOTE: this file documents the intended full schema; as of 2026-07-16 several
-- earlier-dated sections of this file (roughly 2026-06-29 onward: contributor
-- streaks, community challenges, sponsored placements, candidate_generation_runs,
-- rate_limit_counters, admin_audit_events.admin_user_id/admin_user_hash/target_id,
-- watch_subscriptions, contributors, source_candidates, claim_bounties,
-- bounty_submissions) were found NOT to be applied to the live production
-- database despite being documented here and having migration files in
-- supabase/migrations/. Rate limiting was recovered by the Task 5-A security
-- work, and the admin identity/audit shape was recovered by migration
-- 20260716221957. The remaining entries still require live-schema review. This
-- Task 5-0 section IS confirmed applied and live (verified against the actual
-- database, not assumed from this file).
-- =============================================================================

-- Task 5-0: structural foundation (Bible v7 Book IV section 13, Book V).
-- Expand-only. No existing table/column is altered destructively; no existing
-- claim ID/slug/URL/citation_status is changed. All new writers are additive
-- and scoped to task5_ai origin claims only; the legacy admin flow
-- (app/api/admin/verify-claim/route.ts) is untouched and continues to own
-- legacy_manual claims exactly as before.

-- =============================================================================
-- 1. New enums
-- =============================================================================

create type content_origin_type as enum ('legacy_manual', 'task5_ai');
create type publication_mode_type as enum ('manual_legacy', 'assisted_operator', 'crowd_auto');
create type claim_publication_state as enum ('active', 'quarantined', 'withdrawn');
create type risk_result_type as enum ('unknown', 'normal', 'high');
create type claim_evidence_relation as enum ('supports', 'qualifies', 'contradicts');
create type verification_policy_mode as enum ('assisted_operator', 'crowd');

-- =============================================================================
-- 2. claim_versions — immutable per-claim text history
-- =============================================================================

create table claim_versions (
  id uuid primary key default gen_random_uuid(),
  claim_id text not null references claims(id) on delete cascade,
  version integer not null check (version > 0),
  text text not null,
  text_hash text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (claim_id, version)
);

comment on table claim_versions is 'Immutable per-claim text history. No risk_class column by design (risk lives in risk_assessments). No unique(claim_id,text_hash) by design — reverting to a past version''s exact text is allowed; only a no-op re-insert of the immediately preceding hash is rejected (enforced by trigger, not a unique index).';

create index claim_versions_claim_id_idx on claim_versions (claim_id, version desc);

-- Reject only a no-op insert (same text_hash as the immediately preceding
-- version for this claim). Reverting to an EARLIER, non-immediately-preceding
-- version's hash remains allowed, per contract.
create or replace function task5_reject_noop_claim_version() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  previous_hash text;
begin
  select cv.text_hash into previous_hash
  from public.claim_versions cv
  where cv.claim_id = NEW.claim_id
  order by cv.version desc
  limit 1;

  if previous_hash is not null and previous_hash = NEW.text_hash then
    raise exception 'claim_versions: no-op insert rejected (identical text_hash as the immediately preceding version for claim %)', NEW.claim_id;
  end if;

  return NEW;
end;
$$;

create trigger claim_versions_reject_noop
before insert on claim_versions
for each row execute function task5_reject_noop_claim_version();

-- True immutability: reject UPDATE/DELETE unconditionally, including for
-- service_role, as defense-in-depth beyond GRANT (service_role is not
-- necessarily the table owner and PostgreSQL triggers fire regardless of
-- role for non-owner-bypassing operations).
create or replace function task5_reject_mutation() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only/immutable; % is not permitted', TG_TABLE_NAME, TG_OP;
end;
$$;

create trigger claim_versions_immutable_update
before update on claim_versions
for each row execute function task5_reject_mutation();

create trigger claim_versions_immutable_delete
before delete on claim_versions
for each row execute function task5_reject_mutation();

-- =============================================================================
-- 3. risk_assessments — append-only, latest by (created_at desc, id desc)
-- =============================================================================

create table risk_assessments (
  id uuid primary key default gen_random_uuid(),
  claim_version_id uuid not null references claim_versions(id) on delete cascade,
  deterministic_result risk_result_type not null,
  model_result risk_result_type not null,
  final_result risk_result_type not null,
  deterministic_policy_version text not null,
  model_id text,
  prompt_version text,
  failure_reason text,
  created_at timestamptz not null default now()
);

comment on table risk_assessments is 'Append-only. Latest assessment for a claim_version_id is ORDER BY created_at DESC, id DESC LIMIT 1. final_result combination: either side high => high; either side unknown/error => unknown; both normal => normal.';

create index risk_assessments_claim_version_latest_idx on risk_assessments (claim_version_id, created_at desc, id desc);

create trigger risk_assessments_immutable_update
before update on risk_assessments
for each row execute function task5_reject_mutation();

create trigger risk_assessments_immutable_delete
before delete on risk_assessments
for each row execute function task5_reject_mutation();

-- =============================================================================
-- 4. source_snapshots — immutable external-fetch record (Task 5-B1 writer)
-- =============================================================================

create table source_snapshots (
  id uuid primary key default gen_random_uuid(),
  source_id text,
  canonical_url text not null,
  final_url text not null,
  retrieved_at timestamptz not null,
  http_status integer not null,
  content_type text not null,
  content_hash text not null,
  normalized_text_hash text not null,
  normalized_text text,
  storage_path text,
  etag text,
  last_modified text,
  created_at timestamptz not null default now(),
  check (
    (normalized_text is not null and storage_path is null)
    or (normalized_text is null and storage_path is not null)
  )
);

comment on table source_snapshots is 'Immutable. Written only by Task 5-B1''s safeFetchExternalSource pipeline (not yet implemented in this PR). Full normalized_text is server-only; no public API returns it in full.';
comment on column source_snapshots.source_id is 'Free-text reference to an existing claim_sources.id (text) when applicable. Nullable: Task 5-B1 may discover sources not yet represented as a claim_sources row.';

create index source_snapshots_canonical_url_idx on source_snapshots (canonical_url);

create trigger source_snapshots_immutable_update
before update on source_snapshots
for each row execute function task5_reject_mutation();

create trigger source_snapshots_immutable_delete
before delete on source_snapshots
for each row execute function task5_reject_mutation();

-- =============================================================================
-- 5. claim_evidence — quote-level binding between a claim_version and a source_snapshot
-- =============================================================================

create table claim_evidence (
  id uuid primary key default gen_random_uuid(),
  claim_version_id uuid not null references claim_versions(id) on delete cascade,
  source_snapshot_id uuid not null references source_snapshots(id) on delete restrict,
  quote_start integer not null check (quote_start >= 0),
  quote_end integer not null check (quote_end > quote_start),
  quote_hash text not null,
  context_hash text,
  relation claim_evidence_relation not null,
  is_required boolean not null default true,
  created_at timestamptz not null default now(),
  unique (claim_version_id, source_snapshot_id, quote_start, quote_end)
);

comment on table claim_evidence is 'The server re-finds the quote in source_snapshots.normalized_text and verifies uniqueness/offset/hash before insert (app-layer responsibility, Task 5-B1/5-B2) — not re-validated by this table alone.';

create index claim_evidence_claim_version_idx on claim_evidence (claim_version_id);
create index claim_evidence_source_snapshot_idx on claim_evidence (source_snapshot_id);

-- =============================================================================
-- 6. verification_policies — append-only versioned policy
-- =============================================================================

create table verification_policies (
  version integer primary key,
  mode verification_policy_mode not null,
  rules jsonb not null,
  effective_from timestamptz not null,
  created_by uuid,
  created_at timestamptz not null default now()
);

comment on table verification_policies is 'Append-only. Phase 1 uses assisted_operator mode only; crowd mode is reserved for a later phase and must not be referenced by any Phase 0-1 code path.';

create trigger verification_policies_immutable_update
before update on verification_policies
for each row execute function task5_reject_mutation();

create trigger verification_policies_immutable_delete
before delete on verification_policies
for each row execute function task5_reject_mutation();

-- Seed policy version 1 so Task 5-P1 (a later PR) has a real, deterministic
-- assisted-operator policy to reference from day one — additive, does not
-- activate publication (task5_settings.phase stays 0 until an admin raises it).
insert into verification_policies (version, mode, rules, effective_from, created_by)
values (
  1,
  'assisted_operator',
  '{"requires_normal_risk": true, "requires_current_deterministic_policy": true, "auto_publish": false}'::jsonb,
  now(),
  null
)
on conflict (version) do nothing;

-- =============================================================================
-- 7. task5_settings — single-row DB SSOT for the Task 5 phase
-- =============================================================================

create table task5_settings (
  id boolean primary key default true check (id),
  phase integer not null default 0 check (phase between 0 and 4),
  draft_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

comment on table task5_settings is 'Single-row DB SSOT for the Task 5 automation phase. Row absence is handled fail-closed by application code (phase 0, draft disabled, publication denied) — this is not itself an invariant the DB can enforce, since the row missing IS the failure state being guarded against.';

insert into task5_settings (id, phase, draft_enabled, updated_by)
values (true, 0, false, null)
on conflict (id) do nothing;

create or replace function set_task5_phase(p_phase integer, p_reason text, p_admin_user_id uuid default null, p_admin_user_hash text default null)
returns task5_settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_row public.task5_settings;
  result_row public.task5_settings;
  resolved_admin_user_id uuid;
  resolved_admin_user_hash text;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'set_task5_phase: reason is required';
  end if;
  if p_phase < 0 or p_phase > 4 then
    raise exception 'set_task5_phase: phase must be between 0 and 4';
  end if;

  select * into current_row from public.task5_settings where id = true for update;
  if not found then
    raise exception 'set_task5_phase: task5_settings row is missing; cannot transition phase';
  end if;

  if p_phase > current_row.phase + 1 then
    raise exception 'set_task5_phase: phase may only increase by at most 1 per call (current %, requested %)', current_row.phase, p_phase;
  end if;
  -- Downgrades (p_phase < current_row.phase) are allowed immediately.
  -- Same-phase calls (p_phase = current_row.phase) are idempotent.

  select user_id into resolved_admin_user_id
  from public.admin_users
  where user_id = p_admin_user_id and active = true;

  resolved_admin_user_hash := case
    when p_admin_user_hash ~ '^[0-9a-fA-F]{64}$' then lower(p_admin_user_hash)
    else encode(sha256('unknown-admin'::bytea), 'hex')
  end;

  update public.task5_settings
  set phase = p_phase,
      updated_at = now(),
      updated_by = p_admin_user_id
  where id = true
  returning * into result_row;

  insert into public.admin_audit_events (
    admin_user_id,
    admin_user_hash,
    action,
    target_id,
    metadata
  )
  values (
    resolved_admin_user_id,
    resolved_admin_user_hash,
    'task5.phase_changed',
    'task5_settings',
    jsonb_build_object(
      'previous_phase', current_row.phase,
      'new_phase', p_phase,
      'reason', p_reason
    )
  );

  return result_row;
end;
$$;

comment on function set_task5_phase is 'Sole writer of task5_settings.phase. Service-role only. Enforces bounded upgrades, immediate downgrade, mandatory reason, and an atomic structured admin audit row.';

revoke all on task5_settings from anon, authenticated;
grant select on task5_settings to anon, authenticated;
revoke all on function set_task5_phase(integer, text, uuid, text) from public;
grant execute on function set_task5_phase(integer, text, uuid, text) to service_role;

-- =============================================================================
-- 8. Additive columns on claims — publication boundary fields
-- =============================================================================

alter table claims
  add column content_origin content_origin_type not null default 'legacy_manual',
  add column current_claim_version_id uuid references claim_versions(id),
  add column published_claim_version_id uuid references claim_versions(id),
  add column publication_mode publication_mode_type not null default 'manual_legacy',
  add column publication_state claim_publication_state not null default 'active',
  add column published_at timestamptz,
  add column freshness_profile text,
  add column valid_from timestamptz,
  add column valid_until timestamptz;

comment on column claims.content_origin is 'legacy_manual for all pre-Task-5 claims (backfilled below) and any claim created through the existing admin flow going forward; task5_ai only for claims created through the new Task 5-B2 pipeline.';
comment on column claims.publication_state is 'Task 5-F overlay (active/quarantined/withdrawn). Independent of claims.status (citation_status classification) — quarantining a claim does NOT reclassify its citation_status; it only affects public surface presentation, enforced by Task 5-F RPCs (a later PR).';

create index claims_content_origin_idx on claims (content_origin);
create index claims_publication_state_idx on claims (publication_state);

-- =============================================================================
-- 9. Backfill — additive only, no existing ID/slug/URL/citation_status changes
-- =============================================================================

-- Every existing claim becomes version 1 of its own text, with
-- content_origin='legacy_manual' and publication_mode='manual_legacy'.
-- current_claim_version_id AND published_claim_version_id both point at this
-- version 1 row, unconditionally: version 1's text is by construction
-- identical to the claim's existing claim_text, so "the published text" and
-- "the current text" are the same string for every legacy claim. Public
-- visibility remains governed entirely by documents.status (RLS) and
-- citation_status (lib/citation-status.ts) exactly as before — this pointer
-- does not grant, imply, or change any claim's citation status. published_at
-- is left NULL for the backfill: we do not know the real historical
-- publish time for legacy claims and will not fabricate one.
do $$
declare
  claim_row record;
  new_version_id uuid;
begin
  for claim_row in select id, claim_text from claims where current_claim_version_id is null loop
    insert into claim_versions (claim_id, version, text, text_hash, created_by)
    values (claim_row.id, 1, claim_row.claim_text, encode(digest(claim_row.claim_text, 'sha256'), 'hex'), null)
    returning id into new_version_id;

    update claims
    set current_claim_version_id = new_version_id,
        published_claim_version_id = new_version_id
    where id = claim_row.id;
  end loop;
end;
$$;

-- =============================================================================
-- 10. Enforce — task5_ai publication/text-edit boundary (defense-in-depth trigger)
-- =============================================================================

-- Blocks direct writes to status/publication_state/claim_text/claim_value for
-- task5_ai-origin claims unless the session has explicitly opted in via
-- set_config('task5.allow_publication_write','on', true) — a flag ONLY a
-- future SECURITY DEFINER publication RPC (Task 5-P1, a later PR) will ever
-- set. No such RPC exists yet in this PR, so today this trigger unconditionally
-- rejects any direct UPDATE of these columns on a task5_ai claim. Because no
-- task5_ai claims exist yet (content_origin defaults to legacy_manual and the
-- backfill only ever writes legacy_manual), this has zero effect on the
-- existing admin flow today; it is tested with a synthetic task5_ai row in a
-- rolled-back transaction.
create or replace function task5_guard_ai_claim_write() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if OLD.content_origin = 'task5_ai' and (
    NEW.status is distinct from OLD.status
    or NEW.publication_state is distinct from OLD.publication_state
    or NEW.claim_text is distinct from OLD.claim_text
    or NEW.claim_value is distinct from OLD.claim_value
  ) then
    if coalesce(current_setting('task5.allow_publication_write', true), 'off') <> 'on' then
      raise exception 'task5_ai claims cannot be directly updated (status/publication_state/claim_text/claim_value); use the assisted publication RPC';
    end if;
  end if;
  return NEW;
end;
$$;

create trigger claims_guard_task5_ai_write
before update on claims
for each row execute function task5_guard_ai_claim_write();

-- =============================================================================
-- 11. Minimal GRANT for new tables (public-read where the app needs it; no
--     public write anywhere — all Task 5 writers are service-role RPCs/routes
--     added in later PRs)
-- =============================================================================

revoke all on claim_versions, risk_assessments, source_snapshots, claim_evidence, verification_policies from anon, authenticated;
grant select on claim_versions to anon, authenticated;
grant select on risk_assessments to anon, authenticated;
grant select on claim_evidence to anon, authenticated;
grant select on verification_policies to anon, authenticated;
-- source_snapshots is intentionally NOT granted to anon/authenticated: full
-- normalized_text must stay server-only per Book V section 4.3. A future PR
-- can add a narrow view exposing only non-text columns if a public need arises.

alter table claim_versions enable row level security;
alter table risk_assessments enable row level security;
alter table source_snapshots enable row level security;
alter table claim_evidence enable row level security;
alter table verification_policies enable row level security;
alter table task5_settings enable row level security;

create policy claim_versions_public_select on claim_versions for select to anon
  using (exists (
    select 1 from claims c join documents d on d.id = c.document_id
    where (c.current_claim_version_id = claim_versions.id or c.published_claim_version_id = claim_versions.id)
      and d.status in ('published', 'verified')
  ));

create policy risk_assessments_public_select on risk_assessments for select to anon
  using (exists (
    select 1 from claims c
    join documents d on d.id = c.document_id
    where c.published_claim_version_id = risk_assessments.claim_version_id
      and d.status in ('published', 'verified')
  ));

create policy claim_evidence_public_select on claim_evidence for select to anon
  using (exists (
    select 1 from claims c
    join documents d on d.id = c.document_id
    where c.published_claim_version_id = claim_evidence.claim_version_id
      and d.status in ('published', 'verified')
  ));

create policy verification_policies_public_select on verification_policies for select to anon using (true);

create policy task5_settings_public_select on task5_settings for select to anon using (true);

-- =============================================================================
-- 9. Task 5-A — demand signals (mirrors the 20260716210425/20260716211201 migrations)
-- =============================================================================
-- Bible v7 Book IV section 14 / Task 5-A: demand signals.
--
-- Tracks "wanted" claims: text the public is asking about that has no
-- existing claim yet. Two intake sources:
--   user_suggestion  -- explicit, identified suggestion -> opens immediately
--   search_gap       -- system-detected search gap -> requires 2 actors / 3
--                        distinct days / 3 signals within one dedupe epoch
--                        before it promotes from 'observing' to 'open'
--
-- Privacy: actor_key is a salted sha256 hash computed in the app layer
-- (never a raw IP), matching lib/contributor-hash.ts's existing convention.
-- Signals retain actor_key for 8 days only (see cleanup_wanted_claim_signals
-- below and scripts/jobs/cleanup-wanted-claim-signals.mjs).
--
-- Migration-drift note (tracked in issue #487): this section intentionally
-- does NOT depend on the source_contributions section above (source_candidates/
-- contribution_events/contributor_points), because source_candidates depends
-- on the `source_authority` enum type, which -- like several other "core"
-- schema-v3.sql objects -- was never applied to production. wanted_claim_suggesters
-- only needs a minimal, self-contained `contributors` identity table, created
-- here with no dependency on the drifted objects.

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

create index if not exists contributors_account_id_idx on contributors(account_id);

create table if not exists wanted_claims (
  id uuid primary key default gen_random_uuid(),
  locale text not null,
  normalization_version integer not null,
  normalized_text text not null,
  normalized_hash text not null,
  status text not null default 'observing' check (status in (
    'observing','open','drafting','drafted','published',
    'rejected_editorial','closed_infra_failure'
  )),
  draft_failure_count integer not null default 0,
  draft_claim_id text,
  published_claim_id text,
  lease_owner text,
  lease_expires_at timestamptz,
  last_demand_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (locale, normalization_version, normalized_hash)
);

comment on table wanted_claims is 'Bible v7 Task 5 demand intake and lifecycle linkage. draft_claim_id is populated by Task 5-B2; published_claim_id remains reserved for Task 5-P1.';
comment on column wanted_claims.normalization_version is 'Bump when the normalization algorithm changes; write a backfill migration that re-normalizes existing observing/open rows and merges any resulting duplicates (see wanted_claim_normalize_v1).';

create index if not exists wanted_claims_status_idx on wanted_claims(status, last_demand_at desc);

create table if not exists wanted_claim_demand_signals (
  id uuid primary key default gen_random_uuid(),
  wanted_claim_id uuid not null references wanted_claims(id) on delete cascade,
  source text not null check (source in ('user_suggestion','search_gap')),
  bucket_date date not null,
  dedupe_epoch date not null,
  actor_key text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique (wanted_claim_id, source, bucket_date, dedupe_epoch, actor_key)
);

comment on table wanted_claim_demand_signals is 'Append-only demand signal log. actor_key is a salted hash, never a raw IP. Rows are deleted after expires_at (8 days) by cleanup_wanted_claim_signals().';

create index if not exists wanted_claim_demand_signals_claim_epoch_idx
  on wanted_claim_demand_signals(wanted_claim_id, dedupe_epoch);
create index if not exists wanted_claim_demand_signals_expires_idx
  on wanted_claim_demand_signals(expires_at);

create table if not exists wanted_claim_suggesters (
  wanted_claim_id uuid not null references wanted_claims(id) on delete cascade,
  contributor_id uuid not null references contributors(id) on delete cascade,
  created_at timestamptz not null default now(),
  notification_sent_at timestamptz,
  primary key (wanted_claim_id, contributor_id)
);

comment on table wanted_claim_suggesters is 'Identified suggesters for a wanted claim, retained (not deleted by the 8-day signal retention job). notification_sent_at is populated by Task 5-D; always null until then.';

create or replace function wanted_claim_normalize_v1(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(regexp_replace(lower(coalesce(p_text, '')), '\s+', ' ', 'g'));
$$;

create or replace function wanted_claim_normalized_hash(p_text text, p_version integer)
returns text
language plpgsql
immutable
set search_path = public, extensions
as $$
begin
  if p_version = 1 then
    return encode(digest(wanted_claim_normalize_v1(p_text), 'sha256'), 'hex');
  end if;
  raise exception 'unsupported normalization_version: %', p_version;
end;
$$;

revoke execute on function wanted_claim_normalize_v1(text) from public, anon, authenticated;
revoke execute on function wanted_claim_normalized_hash(text, integer) from public, anon, authenticated;
grant execute on function wanted_claim_normalize_v1(text) to service_role;
grant execute on function wanted_claim_normalized_hash(text, integer) to service_role;

-- Promotion only ever moves 'observing' -> 'open'. p_risk_flag=true permanently
-- blocks automatic promotion -- a risk-flagged wanted_claim simply never leaves
-- 'observing', which is itself the "route to operator queue": 'observing' rows
-- are never public and are readable only by admin/service-role tooling.
create or replace function wanted_claim_maybe_promote(p_wanted_claim_id uuid, p_epoch date, p_risk_flag boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_distinct_days integer;
  v_distinct_actors integer;
  v_signal_count integer;
begin
  if p_risk_flag then
    return;
  end if;

  select count(distinct bucket_date), count(distinct actor_key), count(*)
    into v_distinct_days, v_distinct_actors, v_signal_count
  from wanted_claim_demand_signals
  where wanted_claim_id = p_wanted_claim_id
    and dedupe_epoch = p_epoch;

  if v_distinct_days >= 3 and v_distinct_actors >= 2 and v_signal_count >= 3 then
    update wanted_claims
       set status = 'open', updated_at = now()
     where id = p_wanted_claim_id
       and status = 'observing';
  end if;
end;
$$;

revoke execute on function wanted_claim_maybe_promote(uuid, date, boolean) from public, anon, authenticated;
grant execute on function wanted_claim_maybe_promote(uuid, date, boolean) to service_role;

-- submit_wanted_claim_signal: sole writer for all three tables. Callers pass
-- already-hashed identifiers (contributor_hash, actor_key) -- raw IPs never
-- reach this function or any log.
create or replace function submit_wanted_claim_signal(
  p_locale text,
  p_raw_text text,
  p_source text,
  p_actor_key text,
  p_contributor_hash text default null,
  p_risk_flag boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_normalized_text text;
  v_normalized_hash text;
  v_wanted_claim_id uuid;
  v_status text;
  v_bucket_date date := (now() at time zone 'utc')::date;
  v_epoch date := date_trunc('week', now() at time zone 'utc')::date;
  v_expires_at timestamptz := now() + interval '8 days';
  v_contributor_id uuid;
begin
  if p_source not in ('user_suggestion', 'search_gap') then
    raise exception 'invalid source: %', p_source;
  end if;
  if p_locale is null or length(trim(p_locale)) = 0 then
    raise exception 'locale is required';
  end if;
  if p_actor_key is null or length(trim(p_actor_key)) = 0 then
    raise exception 'actor_key is required';
  end if;
  if p_raw_text is null or length(trim(p_raw_text)) = 0 then
    raise exception 'text is required';
  end if;
  if p_source = 'user_suggestion' and (p_contributor_hash is null or length(trim(p_contributor_hash)) = 0) then
    raise exception 'contributor_hash is required for user_suggestion';
  end if;

  v_normalized_text := wanted_claim_normalize_v1(p_raw_text);
  if length(v_normalized_text) = 0 then
    raise exception 'text normalizes to empty';
  end if;
  v_normalized_hash := wanted_claim_normalized_hash(p_raw_text, 1);

  insert into wanted_claims as w (locale, normalization_version, normalized_text, normalized_hash, status, last_demand_at)
  values (
    p_locale,
    1,
    v_normalized_text,
    v_normalized_hash,
    case when p_source = 'user_suggestion' and not p_risk_flag then 'open' else 'observing' end,
    now()
  )
  on conflict (locale, normalization_version, normalized_hash) do update
    set last_demand_at = now(),
        updated_at = now(),
        status = case
          when p_source = 'user_suggestion' and not p_risk_flag and w.status = 'observing' then 'open'
          else w.status
        end
  returning w.id, w.status into v_wanted_claim_id, v_status;

  insert into wanted_claim_demand_signals (wanted_claim_id, source, bucket_date, dedupe_epoch, actor_key, expires_at)
  values (v_wanted_claim_id, p_source, v_bucket_date, v_epoch, p_actor_key, v_expires_at)
  on conflict (wanted_claim_id, source, bucket_date, dedupe_epoch, actor_key) do nothing;

  if p_source = 'user_suggestion' then
    insert into contributors as c (contributor_hash)
    values (p_contributor_hash)
    on conflict (contributor_hash) do update set updated_at = now()
    returning c.id into v_contributor_id;

    insert into wanted_claim_suggesters (wanted_claim_id, contributor_id)
    values (v_wanted_claim_id, v_contributor_id)
    on conflict (wanted_claim_id, contributor_id) do nothing;
  end if;

  perform wanted_claim_maybe_promote(v_wanted_claim_id, v_epoch, p_risk_flag);

  select status into v_status from wanted_claims where id = v_wanted_claim_id;

  return jsonb_build_object('wanted_claim_id', v_wanted_claim_id, 'status', v_status);
end;
$$;

revoke all on function submit_wanted_claim_signal(text, text, text, text, text, boolean) from public;
grant execute on function submit_wanted_claim_signal(text, text, text, text, text, boolean) to service_role;

-- Retention: delete demand signals past their 8-day expiry. Called by
-- scripts/jobs/cleanup-wanted-claim-signals.mjs. wanted_claim_suggesters rows
-- are NOT touched -- suggesters are retained per Bible v7 section 14.
create or replace function cleanup_wanted_claim_signals()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from wanted_claim_demand_signals where expires_at <= now();
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function cleanup_wanted_claim_signals() from public;
grant execute on function cleanup_wanted_claim_signals() to service_role;

-- RLS: no anon/authenticated grants on any of these tables. This app has no
-- Supabase-Auth-JWT end-user identity -- every public write already goes
-- through a Next.js API route using the service-role key. "anon no read" /
-- "authenticated own suggestion via RPC only" (Bible v7 section 14) is
-- satisfied here by: zero table-level grants to anon or authenticated, and
-- submit_wanted_claim_signal as the sole entry point, executable only by
-- service_role.
alter table contributors enable row level security;
alter table wanted_claims enable row level security;
alter table wanted_claim_demand_signals enable row level security;
alter table wanted_claim_suggesters enable row level security;

-- No policies created: default-deny for anon and authenticated on all four
-- tables. All access is service-role via SECURITY DEFINER functions above.

-- Defense-in-depth: this project has an org-level `ALTER DEFAULT PRIVILEGES
-- FOR ROLE postgres/supabase_admin IN SCHEMA public GRANT ... TO anon,
-- authenticated` that auto-grants full CRUD (including TRUNCATE, which RLS
-- does NOT protect against in Postgres) to every newly created table,
-- regardless of what a migration itself grants (confirmed via pg_default_acl;
-- tracked project-wide in issue #469). Revoke it explicitly here so RLS is
-- not the only thing standing between anon/authenticated and these rows.
revoke all on contributors, wanted_claims, wanted_claim_demand_signals, wanted_claim_suggesters from anon, authenticated;

-- Privacy/retention policy notes:
-- - Never persist raw IP addresses. Public contributors are identified only by contributor_hash.
-- - Raw user-agent strings are not stored in admin audit metadata; store a short salted/one-way hash or omit.
-- - Public intake submissions (edits, reports, hallucination_reports, topic_suggestions, topic_candidates) should be reviewed and deleted/anonymized within 180 days after final status, unless retained as accepted claim provenance.
-- - Inactive topic_adoptions and resolved watch_subscriptions should be anonymized or aggregated after 365 days unless needed for contributor reward accounting.
-- - Admin audit events should be retained for 365 days, then deleted or aggregated.

-- =============================================================================
-- Distributed rate limiting
-- Mirrors supabase/migrations/20260716124542_rate_limit_counters.sql.
-- =============================================================================

create table if not exists public.rate_limit_counters (
  bucket             text not null,
  key_hash           text not null,
  count              integer not null default 0,
  window_started_at  timestamptz not null default now(),
  expires_at         timestamptz not null,
  primary key (bucket, key_hash)
);

create index if not exists rate_limit_counters_expires_idx
  on public.rate_limit_counters (expires_at);

alter table public.rate_limit_counters enable row level security;

drop policy if exists rate_limit_counters_public_select on public.rate_limit_counters;
drop policy if exists rate_limit_counters_public_insert on public.rate_limit_counters;
drop policy if exists rate_limit_counters_public_update on public.rate_limit_counters;
drop policy if exists rate_limit_counters_public_delete on public.rate_limit_counters;

create or replace function public.increment_rate_limit(
  p_bucket     text,
  p_key_hash   text,
  p_max        integer,
  p_window_ms  bigint
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now   timestamptz := now();
  v_count integer;
  v_reset timestamptz;
begin
  insert into public.rate_limit_counters as r
    (bucket, key_hash, count, window_started_at, expires_at)
  values (
    p_bucket,
    p_key_hash,
    1,
    v_now,
    v_now + make_interval(secs => p_window_ms / 1000.0)
  )
  on conflict (bucket, key_hash) do update
    set count = case when r.expires_at <= v_now then 1 else r.count + 1 end,
        window_started_at = case when r.expires_at <= v_now then v_now else r.window_started_at end,
        expires_at = case when r.expires_at <= v_now
                          then v_now + make_interval(secs => p_window_ms / 1000.0)
                          else r.expires_at end
  returning r.count, r.expires_at into v_count, v_reset;

  return jsonb_build_object(
    'count', v_count,
    'limited', v_count > p_max,
    'reset_at_ms', (extract(epoch from v_reset) * 1000)::bigint
  );
end;
$$;

revoke all on function public.increment_rate_limit(text, text, integer, bigint)
  from public;
grant execute on function public.increment_rate_limit(text, text, integer, bigint)
  to service_role;

-- =============================================================================
-- Least-privilege recovery
-- Mirrors supabase/migrations/20260716210327_least_privilege_recovery.sql.
-- =============================================================================

revoke execute on function public.increment_rate_limit(text, text, integer, bigint)
  from public, anon, authenticated;
grant execute on function public.increment_rate_limit(text, text, integer, bigint)
  to service_role;

revoke execute on function public.set_task5_phase(integer, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.set_task5_phase(integer, text, uuid, text)
  to service_role;

revoke truncate on all tables in schema public from anon, authenticated;

revoke insert, update, delete on table
  public.claims,
  public.claim_sources,
  public.documents,
  public.verification_events
from anon, authenticated;

revoke all privileges on table
  public.admin_audit_events,
  public.rate_limit_counters
from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke truncate on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;


-- =============================================================================
-- Task 5-B2: Phase-0 shadow drafting (added 2026-07-17)
-- Mirrors supabase/migrations/20260716225254_task5_b2_shadow_drafting.sql
-- and 20260716225503_task5_b2_fk_indexes.sql.
-- =============================================================================

-- Task 5-B2: Phase-0 shadow drafting control plane (applied 20260716225254).
-- Additive only. No publication function, trigger, or public grant is created.

-- Task 5-A reserved these references as UUIDs before the canonical claims table
-- contract was reconciled. Claims use text primary keys, and both columns are
-- still null in production at the B2 gate, so convert them before first use.
alter table public.wanted_claims
  alter column draft_claim_id type text using draft_claim_id::text,
  alter column published_claim_id type text using published_claim_id::text;

alter table public.wanted_claims
  add constraint wanted_claims_draft_claim_id_fkey
    foreign key (draft_claim_id) references public.claims(id) on delete set null,
  add constraint wanted_claims_published_claim_id_fkey
    foreign key (published_claim_id) references public.claims(id) on delete set null;

create table public.task5_runs (
  id uuid primary key default gen_random_uuid(),
  run_type text not null check (run_type = 'shadow_draft'),
  scheduled_for timestamptz not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  state text not null default 'running' check (state in ('running','completed','partial','failed','skipped')),
  leased_count integer not null default 0 check (leased_count >= 0),
  success_count integer not null default 0 check (success_count >= 0),
  failure_count integer not null default 0 check (failure_count >= 0),
  correlation_id text not null unique,
  error_code text,
  created_at timestamptz not null default now()
);

create table public.draft_attempts (
  id uuid primary key default gen_random_uuid(),
  wanted_claim_id uuid not null references public.wanted_claims(id) on delete cascade,
  run_id uuid not null references public.task5_runs(id) on delete cascade,
  worker_id text not null,
  prompt_version text not null,
  risk_prompt_version text not null,
  idempotency_key text not null unique,
  state text not null default 'leased' check (state in (
    'leased','source_discovery','structuring','risk_assessment','completed',
    'retryable_failed','permanent_failed'
  )),
  attempt_number integer not null check (attempt_number > 0),
  lease_expires_at timestamptz not null,
  provider text,
  model_id text,
  provider_request_id text,
  model_provenance jsonb not null default '[]'::jsonb,
  source_snapshot_id uuid references public.source_snapshots(id) on delete restrict,
  claim_id text references public.claims(id) on delete set null,
  reserved_calls integer not null default 0 check (reserved_calls >= 0),
  reserved_input_tokens bigint not null default 0 check (reserved_input_tokens >= 0),
  reserved_output_tokens bigint not null default 0 check (reserved_output_tokens >= 0),
  reserved_cost_usd numeric(14,6) not null default 0 check (reserved_cost_usd >= 0),
  actual_input_tokens bigint not null default 0 check (actual_input_tokens >= 0),
  actual_output_tokens bigint not null default 0 check (actual_output_tokens >= 0),
  actual_cost_usd numeric(14,6) not null default 0 check (actual_cost_usd >= 0),
  error_class text,
  error_code text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (wanted_claim_id, attempt_number)
);

create index draft_attempts_active_lease_idx
  on public.draft_attempts (lease_expires_at)
  where state in ('leased','source_discovery','structuring','risk_assessment');
create index draft_attempts_run_idx on public.draft_attempts (run_id);

create table public.task5_budget_limits (
  provider text primary key,
  max_calls integer not null check (max_calls > 0),
  max_input_tokens bigint not null check (max_input_tokens > 0),
  max_output_tokens bigint not null check (max_output_tokens > 0),
  max_cost_usd numeric(14,6) not null check (max_cost_usd > 0),
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table public.cost_ledger (
  usage_date date not null,
  provider text not null references public.task5_budget_limits(provider) on delete restrict,
  reserved_calls integer not null default 0 check (reserved_calls >= 0),
  completed_calls integer not null default 0 check (completed_calls >= 0),
  reserved_input_tokens bigint not null default 0 check (reserved_input_tokens >= 0),
  reserved_output_tokens bigint not null default 0 check (reserved_output_tokens >= 0),
  actual_input_tokens bigint not null default 0 check (actual_input_tokens >= 0),
  actual_output_tokens bigint not null default 0 check (actual_output_tokens >= 0),
  reserved_cost numeric(14,6) not null default 0 check (reserved_cost >= 0),
  actual_cost numeric(14,6) not null default 0 check (actual_cost >= 0),
  budget_overshoot boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (usage_date, provider)
);

create table public.task5_cost_events (
  usage_key text primary key,
  attempt_id uuid not null references public.draft_attempts(id) on delete cascade,
  provider text not null references public.task5_budget_limits(provider) on delete restrict,
  state text not null default 'reserved' check (state in ('reserved','reconciled')),
  reserved_calls integer not null check (reserved_calls > 0),
  reserved_input_tokens bigint not null check (reserved_input_tokens >= 0),
  reserved_output_tokens bigint not null check (reserved_output_tokens >= 0),
  reserved_cost numeric(14,6) not null check (reserved_cost >= 0),
  actual_input_tokens bigint,
  actual_output_tokens bigint,
  actual_cost numeric(14,6),
  created_at timestamptz not null default now(),
  reconciled_at timestamptz
);

-- Disabled by default. An operator must explicitly enable both drafting and
-- provider budget before any paid call can be reserved.
insert into public.task5_budget_limits (
  provider, max_calls, max_input_tokens, max_output_tokens, max_cost_usd, enabled
)
values
  ('perplexity', 100, 200000, 100000, 5.000000, false),
  ('gpt', 100, 200000, 100000, 5.000000, false)
on conflict (provider) do nothing;

alter table public.task5_runs enable row level security;
alter table public.draft_attempts enable row level security;
alter table public.task5_budget_limits enable row level security;
alter table public.cost_ledger enable row level security;
alter table public.task5_cost_events enable row level security;

revoke all on table public.task5_runs, public.draft_attempts,
  public.task5_budget_limits, public.cost_ledger, public.task5_cost_events
  from public, anon, authenticated;
grant select, insert, update on table public.task5_runs, public.draft_attempts,
  public.task5_budget_limits, public.cost_ledger, public.task5_cost_events to service_role;

create or replace function public.set_task5_draft_enabled(
  p_enabled boolean,
  p_reason text,
  p_admin_user_id uuid default null,
  p_admin_user_hash text default null
)
returns public.task5_settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  result_row public.task5_settings;
  actor_hash text;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'set_task5_draft_enabled: reason is required';
  end if;

  actor_hash := case
    when p_admin_user_hash ~ '^[0-9a-fA-F]{64}$' then lower(p_admin_user_hash)
    else encode(sha256('unknown-admin'::bytea), 'hex')
  end;

  update public.task5_settings
  set draft_enabled = p_enabled,
      updated_at = now(),
      updated_by = p_admin_user_id
  where id = true
  returning * into result_row;

  if not found then
    raise exception 'set_task5_draft_enabled: task5_settings row is missing';
  end if;

  insert into public.admin_audit_events (
    admin_user_id, admin_user_hash, action, target_id, metadata
  ) values (
    case when exists (
      select 1 from public.admin_users where user_id = p_admin_user_id and active = true
    ) then p_admin_user_id else null end,
    actor_hash,
    'task5.draft_enabled_changed',
    'task5_settings',
    jsonb_build_object('draft_enabled', p_enabled, 'reason', p_reason)
  );

  return result_row;
end;
$$;

create or replace function public.recover_expired_task5_draft_leases()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  recovered integer;
begin
  with expired as (
    update public.draft_attempts
    set state = 'retryable_failed',
        error_class = 'lease',
        error_code = 'lease_expired',
        completed_at = now()
    where state in ('leased','source_discovery','structuring','risk_assessment')
      and lease_expires_at < now()
    returning wanted_claim_id
  ), reset_wanted as (
    update public.wanted_claims w
    set status = case when w.draft_failure_count + 1 >= 3 then 'closed_infra_failure' else 'open' end,
        draft_failure_count = w.draft_failure_count + 1,
        lease_owner = null,
        lease_expires_at = null,
        updated_at = now()
    where w.id in (select wanted_claim_id from expired)
      and w.status = 'drafting'
    returning w.id
  )
  select count(*) into recovered from reset_wanted;

  return recovered;
end;
$$;

create or replace function public.lease_task5_wanted_claims(
  p_worker_id text,
  p_limit integer,
  p_lease_seconds integer,
  p_scheduled_for timestamptz,
  p_correlation_id text,
  p_prompt_version text,
  p_risk_prompt_version text
)
returns table (
  run_id uuid,
  attempt_id uuid,
  wanted_claim_id uuid,
  locale text,
  normalized_text text,
  attempt_number integer,
  lease_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_run_id uuid;
begin
  if p_worker_id is null or length(trim(p_worker_id)) = 0 then
    raise exception 'lease_task5_wanted_claims: worker_id is required';
  end if;
  if p_limit < 1 or p_limit > 10 then
    raise exception 'lease_task5_wanted_claims: limit must be 1..10';
  end if;
  if p_lease_seconds < 60 or p_lease_seconds > 1800 then
    raise exception 'lease_task5_wanted_claims: lease_seconds must be 60..1800';
  end if;
  if not exists (
    select 1 from public.task5_settings
    where id = true and phase = 0 and draft_enabled = true
  ) then
    raise exception 'lease_task5_wanted_claims: shadow drafting is disabled';
  end if;

  perform public.recover_expired_task5_draft_leases();

  insert into public.task5_runs (run_type, scheduled_for, correlation_id)
  values ('shadow_draft', p_scheduled_for, p_correlation_id)
  returning id into new_run_id;

  return query
  with selected as (
    select w.id
    from public.wanted_claims w
    where w.status = 'open'
      and w.draft_claim_id is null
      and (w.lease_expires_at is null or w.lease_expires_at < now())
    order by w.last_demand_at desc nulls last, w.created_at
    for update skip locked
    limit p_limit
  ), leased as (
    update public.wanted_claims w
    set status = 'drafting',
        lease_owner = p_worker_id,
        lease_expires_at = now() + make_interval(secs => p_lease_seconds),
        updated_at = now()
    from selected s
    where w.id = s.id
    returning w.*
  ), attempts as (
    insert into public.draft_attempts (
      wanted_claim_id, run_id, worker_id, prompt_version,
      risk_prompt_version, idempotency_key, attempt_number, lease_expires_at
    )
    select l.id,
           new_run_id,
           p_worker_id,
           p_prompt_version,
           p_risk_prompt_version,
           l.id::text || ':' || coalesce((
             select max(a.attempt_number) + 1
             from public.draft_attempts a where a.wanted_claim_id = l.id
           ), 1)::text,
           coalesce((
             select max(a.attempt_number) + 1
             from public.draft_attempts a where a.wanted_claim_id = l.id
           ), 1),
           l.lease_expires_at
    from leased l
    returning *
  )
  select new_run_id, a.id, l.id, l.locale, l.normalized_text,
         a.attempt_number, a.lease_expires_at
  from attempts a
  join leased l on l.id = a.wanted_claim_id;

  update public.task5_runs r
  set leased_count = (select count(*) from public.draft_attempts a where a.run_id = new_run_id)
  where r.id = new_run_id;

  update public.task5_runs
  set state = 'completed', completed_at = now()
  where id = new_run_id and leased_count = 0;
end;
$$;

create or replace function public.reserve_task5_budget(
  p_usage_key text,
  p_attempt_id uuid,
  p_provider text,
  p_calls integer,
  p_input_tokens bigint,
  p_output_tokens bigint,
  p_cost numeric
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  limits public.task5_budget_limits;
  reserved_rows integer;
begin
  if p_usage_key is null or length(trim(p_usage_key)) = 0 then
    raise exception 'reserve_task5_budget: usage_key required';
  end if;
  if p_calls < 1 or p_input_tokens < 0 or p_output_tokens < 0 or p_cost < 0 then
    raise exception 'reserve_task5_budget: invalid reservation';
  end if;
  if not exists (
    select 1 from public.draft_attempts
    where id = p_attempt_id
      and state in ('leased','source_discovery','structuring','risk_assessment')
  ) then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_usage_key, 0));
  if exists (
    select 1 from public.task5_cost_events
    where usage_key = p_usage_key and attempt_id = p_attempt_id and provider = p_provider
  ) then
    return true;
  end if;

  select * into limits from public.task5_budget_limits
  where provider = p_provider and enabled = true
  for update;
  if not found then return false; end if;

  insert into public.cost_ledger (usage_date, provider)
  values (current_date, p_provider)
  on conflict (usage_date, provider) do nothing;

  update public.cost_ledger l
  set reserved_calls = l.reserved_calls + p_calls,
      reserved_input_tokens = l.reserved_input_tokens + p_input_tokens,
      reserved_output_tokens = l.reserved_output_tokens + p_output_tokens,
      reserved_cost = l.reserved_cost + p_cost,
      updated_at = now()
  where l.usage_date = current_date
    and l.provider = p_provider
    and greatest(l.reserved_calls, l.completed_calls) + p_calls <= limits.max_calls
    and greatest(l.reserved_input_tokens, l.actual_input_tokens) + p_input_tokens <= limits.max_input_tokens
    and greatest(l.reserved_output_tokens, l.actual_output_tokens) + p_output_tokens <= limits.max_output_tokens
    and greatest(l.reserved_cost, l.actual_cost) + p_cost <= limits.max_cost_usd;
  get diagnostics reserved_rows = row_count;

  if reserved_rows = 1 then
    insert into public.task5_cost_events (
      usage_key, attempt_id, provider, reserved_calls,
      reserved_input_tokens, reserved_output_tokens, reserved_cost
    ) values (
      p_usage_key, p_attempt_id, p_provider, p_calls,
      p_input_tokens, p_output_tokens, p_cost
    );
    update public.draft_attempts
    set reserved_calls = reserved_calls + p_calls,
        reserved_input_tokens = reserved_input_tokens + p_input_tokens,
        reserved_output_tokens = reserved_output_tokens + p_output_tokens,
        reserved_cost_usd = reserved_cost_usd + p_cost
    where id = p_attempt_id;
  end if;
  return reserved_rows = 1;
end;
$$;

create or replace function public.reconcile_task5_budget(
  p_usage_key text,
  p_input_tokens bigint,
  p_output_tokens bigint,
  p_cost numeric
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  limits public.task5_budget_limits;
  event_row public.task5_cost_events;
  overshoot boolean;
begin
  select * into event_row from public.task5_cost_events
  where usage_key = p_usage_key for update;
  if not found then raise exception 'reconcile_task5_budget: reservation missing'; end if;

  select * into limits from public.task5_budget_limits where provider = event_row.provider;
  if not found then raise exception 'reconcile_task5_budget: provider has no limit'; end if;

  if event_row.state = 'reconciled' then
    select budget_overshoot into overshoot from public.cost_ledger
    where usage_date = event_row.created_at::date and provider = event_row.provider;
    return coalesce(overshoot, true);
  end if;

  update public.cost_ledger
  set completed_calls = completed_calls + event_row.reserved_calls,
      actual_input_tokens = actual_input_tokens + greatest(p_input_tokens, 0),
      actual_output_tokens = actual_output_tokens + greatest(p_output_tokens, 0),
      actual_cost = actual_cost + greatest(p_cost, 0),
      updated_at = now()
  where usage_date = event_row.created_at::date and provider = event_row.provider;

  update public.cost_ledger
  set budget_overshoot = completed_calls > limits.max_calls
      or actual_input_tokens > limits.max_input_tokens
      or actual_output_tokens > limits.max_output_tokens
      or actual_cost > limits.max_cost_usd
  where usage_date = event_row.created_at::date and provider = event_row.provider
  returning budget_overshoot into overshoot;

  update public.task5_cost_events
  set state = 'reconciled',
      actual_input_tokens = greatest(p_input_tokens, 0),
      actual_output_tokens = greatest(p_output_tokens, 0),
      actual_cost = greatest(p_cost, 0),
      reconciled_at = now()
  where usage_key = p_usage_key;

  update public.draft_attempts
  set actual_input_tokens = actual_input_tokens + greatest(p_input_tokens, 0),
      actual_output_tokens = actual_output_tokens + greatest(p_output_tokens, 0),
      actual_cost_usd = actual_cost_usd + greatest(p_cost, 0)
  where id = event_row.attempt_id;

  return coalesce(overshoot, true);
end;
$$;

create or replace function public.record_task5_model_call(
  p_attempt_id uuid,
  p_stage text,
  p_provider text,
  p_model_id text,
  p_prompt_version text,
  p_provider_request_id text default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.draft_attempts
  set model_provenance = model_provenance || jsonb_build_array(jsonb_build_object(
    'stage', p_stage,
    'provider', p_provider,
    'model_id', p_model_id,
    'prompt_version', p_prompt_version,
    'provider_request_id', p_provider_request_id
  ))
  where id = p_attempt_id;
$$;

create or replace function public.complete_task5_shadow_draft(
  p_attempt_id uuid,
  p_worker_id text,
  p_source_snapshot_id uuid,
  p_answer text,
  p_quote_start integer,
  p_quote_end integer,
  p_quote_hash text,
  p_context_hash text,
  p_deterministic_result public.risk_result_type,
  p_model_result public.risk_result_type,
  p_deterministic_policy_version text,
  p_model_id text,
  p_prompt_version text,
  p_provider text,
  p_provider_request_id text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt_row public.draft_attempts;
  wanted_row public.wanted_claims;
  claim_id_value text;
  document_id_value text;
  slug_value text;
  version_id uuid;
  final_risk public.risk_result_type;
begin
  select * into attempt_row from public.draft_attempts where id = p_attempt_id for update;
  if not found then raise exception 'complete_task5_shadow_draft: attempt missing'; end if;
  if attempt_row.worker_id <> p_worker_id then raise exception 'complete_task5_shadow_draft: worker mismatch'; end if;
  if attempt_row.state = 'completed' and attempt_row.claim_id is not null then return attempt_row.claim_id; end if;
  if attempt_row.lease_expires_at < now() then raise exception 'complete_task5_shadow_draft: lease expired'; end if;
  if p_answer is null or length(trim(p_answer)) = 0 then raise exception 'complete_task5_shadow_draft: answer required'; end if;

  select * into wanted_row from public.wanted_claims where id = attempt_row.wanted_claim_id for update;
  if wanted_row.draft_claim_id is not null then return wanted_row.draft_claim_id; end if;

  final_risk := case
    when p_deterministic_result = 'high' or p_model_result = 'high' then 'high'::public.risk_result_type
    when p_deterministic_result = 'unknown' or p_model_result = 'unknown' then 'unknown'::public.risk_result_type
    else 'normal'::public.risk_result_type
  end;

  claim_id_value := 'task5-' || wanted_row.id::text;
  document_id_value := 'task5-shadow-' || wanted_row.id::text;
  slug_value := 'task5-' || replace(wanted_row.id::text, '-', '');

  insert into public.entities (id, type, canonical_name, country)
  values ('task5-shadow', 'task5_shadow', 'Task 5 Shadow Drafts', 'GLOBAL')
  on conflict (id) do nothing;

  insert into public.documents (
    id, entity_id, slug, lang, country, jurisdiction, canonical_slug,
    title, category, template, status, confidence, risk_tier,
    update_frequency, disclaimer_type, translation_status
  ) values (
    document_id_value, 'task5-shadow', slug_value, wanted_row.locale, 'GLOBAL', 'GLOBAL',
    slug_value, wanted_row.normalized_text, 'task5_shadow', document_id_value,
    'ai_draft', 'low', case when final_risk = 'normal' then 'low' else 'high' end,
    'event_based', 'check_official_source', 'source_language'
  ) on conflict (id) do nothing;

  insert into public.claims (
    id, document_id, entity_id, field_path, claim_text, claim_value,
    jurisdiction, country, risk_tier, update_frequency, disclaimer_type,
    lang, confidence, status, content_origin, publication_mode, publication_state
  ) values (
    claim_id_value, document_id_value, 'task5-shadow', 'task5.answer',
    wanted_row.normalized_text, trim(p_answer), 'GLOBAL', 'GLOBAL',
    case when final_risk = 'normal' then 'low' else 'high' end,
    'event_based', 'check_official_source', wanted_row.locale, 'low', 'needs_review',
    'task5_ai', 'assisted_operator', 'active'
  );

  insert into public.claim_versions (claim_id, version, text, text_hash)
  values (claim_id_value, 1, trim(p_answer), encode(sha256(convert_to(trim(p_answer), 'UTF8')), 'hex'))
  returning id into version_id;

  update public.claims set current_claim_version_id = version_id where id = claim_id_value;

  insert into public.claim_evidence (
    claim_version_id, source_snapshot_id, quote_start, quote_end,
    quote_hash, context_hash, relation, is_required
  ) values (
    version_id, p_source_snapshot_id, p_quote_start, p_quote_end,
    p_quote_hash, p_context_hash, 'supports', true
  );

  insert into public.risk_assessments (
    claim_version_id, deterministic_result, model_result, final_result,
    deterministic_policy_version, model_id, prompt_version,
    failure_reason
  ) values (
    version_id, p_deterministic_result, p_model_result, final_risk,
    p_deterministic_policy_version, p_model_id, p_prompt_version,
    case when p_model_result = 'unknown' then 'model_unknown_or_error' else null end
  );

  update public.wanted_claims
  set status = 'drafted', draft_claim_id = claim_id_value,
      lease_owner = null, lease_expires_at = null, updated_at = now()
  where id = wanted_row.id;

  update public.draft_attempts
  set state = 'completed', completed_at = now(), claim_id = claim_id_value,
      source_snapshot_id = p_source_snapshot_id, provider = p_provider,
      model_id = p_model_id, provider_request_id = p_provider_request_id
  where id = p_attempt_id;

  update public.task5_runs set success_count = success_count + 1 where id = attempt_row.run_id;
  return claim_id_value;
end;
$$;

create or replace function public.fail_task5_shadow_draft(
  p_attempt_id uuid,
  p_worker_id text,
  p_error_class text,
  p_error_code text,
  p_retryable boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt_row public.draft_attempts;
  failures integer;
begin
  select * into attempt_row from public.draft_attempts where id = p_attempt_id for update;
  if not found or attempt_row.state in ('completed','retryable_failed','permanent_failed') then return; end if;
  if attempt_row.worker_id <> p_worker_id then raise exception 'fail_task5_shadow_draft: worker mismatch'; end if;

  update public.draft_attempts
  set state = case when p_retryable then 'retryable_failed' else 'permanent_failed' end,
      error_class = left(coalesce(p_error_class, 'unknown'), 80),
      error_code = left(coalesce(p_error_code, 'unknown'), 120),
      completed_at = now()
  where id = p_attempt_id;

  update public.wanted_claims
  set draft_failure_count = draft_failure_count + 1,
      status = case
        when not p_retryable or draft_failure_count + 1 >= 3 then 'closed_infra_failure'
        else 'open'
      end,
      lease_owner = null, lease_expires_at = null, updated_at = now()
  where id = attempt_row.wanted_claim_id
  returning draft_failure_count into failures;

  update public.task5_runs set failure_count = failure_count + 1 where id = attempt_row.run_id;
end;
$$;

create or replace function public.finish_task5_run(p_run_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.task5_runs
  set completed_at = now(),
      state = case
        when failure_count = 0 then 'completed'
        when success_count > 0 then 'partial'
        else 'failed'
      end
  where id = p_run_id and state = 'running';
$$;

revoke all on function public.set_task5_draft_enabled(boolean,text,uuid,text) from public, anon, authenticated;
revoke all on function public.recover_expired_task5_draft_leases() from public, anon, authenticated;
revoke all on function public.lease_task5_wanted_claims(text,integer,integer,timestamptz,text,text,text) from public, anon, authenticated;
revoke all on function public.reserve_task5_budget(text,uuid,text,integer,bigint,bigint,numeric) from public, anon, authenticated;
revoke all on function public.reconcile_task5_budget(text,bigint,bigint,numeric) from public, anon, authenticated;
revoke all on function public.record_task5_model_call(uuid,text,text,text,text,text) from public, anon, authenticated;
revoke all on function public.complete_task5_shadow_draft(uuid,text,uuid,text,integer,integer,text,text,public.risk_result_type,public.risk_result_type,text,text,text,text,text) from public, anon, authenticated;
revoke all on function public.fail_task5_shadow_draft(uuid,text,text,text,boolean) from public, anon, authenticated;
revoke all on function public.finish_task5_run(uuid) from public, anon, authenticated;

grant execute on function public.set_task5_draft_enabled(boolean,text,uuid,text) to service_role;
grant execute on function public.recover_expired_task5_draft_leases() to service_role;
grant execute on function public.lease_task5_wanted_claims(text,integer,integer,timestamptz,text,text,text) to service_role;
grant execute on function public.reserve_task5_budget(text,uuid,text,integer,bigint,bigint,numeric) to service_role;
grant execute on function public.reconcile_task5_budget(text,bigint,bigint,numeric) to service_role;
grant execute on function public.record_task5_model_call(uuid,text,text,text,text,text) to service_role;
grant execute on function public.complete_task5_shadow_draft(uuid,text,uuid,text,integer,integer,text,text,public.risk_result_type,public.risk_result_type,text,text,text,text,text) to service_role;
grant execute on function public.fail_task5_shadow_draft(uuid,text,text,text,boolean) to service_role;
grant execute on function public.finish_task5_run(uuid) to service_role;

comment on table public.draft_attempts is 'Task 5-B2 attempt/idempotency/provenance ledger. Service-role only.';
comment on table public.task5_runs is 'Task 5-B2 scheduled shadow-run telemetry. Service-role only.';
comment on table public.cost_ledger is 'Daily atomic reservation and actual AI usage ledger. Service-role only.';
comment on function public.complete_task5_shadow_draft(uuid,text,uuid,text,integer,integer,text,text,public.risk_result_type,public.risk_result_type,text,text,text,text,text) is 'Creates needs-review Task-5 AI drafts and evidence only. It has no publication path.';

-- Task 5-B2 follow-up (applied 20260716225503): cover service-only lifecycle foreign keys.

create index if not exists wanted_claims_draft_claim_id_idx
  on public.wanted_claims (draft_claim_id) where draft_claim_id is not null;
create index if not exists wanted_claims_published_claim_id_idx
  on public.wanted_claims (published_claim_id) where published_claim_id is not null;
create index if not exists draft_attempts_source_snapshot_id_idx
  on public.draft_attempts (source_snapshot_id) where source_snapshot_id is not null;
create index if not exists draft_attempts_claim_id_idx
  on public.draft_attempts (claim_id) where claim_id is not null;
create index if not exists cost_ledger_provider_idx
  on public.cost_ledger (provider);
create index if not exists task5_cost_events_attempt_id_idx
  on public.task5_cost_events (attempt_id);
create index if not exists task5_cost_events_provider_idx
  on public.task5_cost_events (provider);
