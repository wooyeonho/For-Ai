-- schema-v3-monetization.sql
-- Monetization foundation tables for For-Ai global fact registry.
-- Extends schema-v3.sql. Run AFTER schema-v3.sql.

-- API access tiers: free, pro, enterprise
create type api_tier as enum ('free', 'pro', 'enterprise');

-- Business profile verification status
create type business_profile_status as enum ('pending', 'verified', 'suspended', 'rejected');

-- Business correction request priority
create type correction_priority as enum ('standard', 'priority', 'urgent');

-- Reputation alert severity
create type alert_severity as enum ('info', 'warning', 'critical');

-- ─────────────────────────────────────────────────────────────────────────────
-- Verified Business Profiles
-- Businesses can claim and maintain their own entities/facts.
-- ─────────────────────────────────────────────────────────────────────────────
create table verified_business_profiles (
  id              uuid primary key default gen_random_uuid(),
  entity_id       text not null references entities(id) on delete restrict,
  business_name   text not null,
  business_email  text not null,
  business_url    text,
  country         text not null,
  industry        text,
  contact_name    text,
  contact_email_consent boolean not null default false,
  contact_email_purpose text not null default 'business_profile_verification',
  verification_method text not null default 'email'
                  check (verification_method in ('email', 'domain', 'document', 'phone')),
  verification_review_url text,
  status          business_profile_status not null default 'pending',
  tier            api_tier not null default 'free',
  verified_at     timestamptz,
  expires_at      timestamptz,
  metadata        jsonb not null default '{}'::jsonb,
  contributor_hash text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint vbp_email_consent_required check (contact_email_consent = true),
  constraint vbp_email_purpose_required check (length(contact_email_purpose) > 0),
  constraint vbp_no_document_blob_in_metadata check (not (metadata ? 'verification_document')),
  constraint vbp_no_raw_request_metadata check (
    not (metadata ?| array['ip', 'raw_ip', 'client_ip', 'x_forwarded_for', 'x_real_ip', 'user_agent', 'raw_user_agent'])
  )
);

create unique index verified_business_profiles_entity_id_key on verified_business_profiles(entity_id);
create index verified_business_profiles_status_idx on verified_business_profiles(status);
create index verified_business_profiles_tier_idx on verified_business_profiles(tier);

comment on table verified_business_profiles is 'Businesses that have claimed and verified ownership of an entity. Stores business contact email only with explicit consent/purpose for verification and account notices; never store raw IP/user-agent or verification document blobs.';
comment on column verified_business_profiles.business_email is 'Business contact email; requires contact_email_consent and contact_email_purpose. Retain only while the profile is pending/active and delete or anonymize within 30 days after rejection/closure unless legally required.';
comment on column verified_business_profiles.contact_email_consent is 'Explicit consent for storing business_email for the stated contact_email_purpose.';
comment on column verified_business_profiles.contact_email_purpose is 'Specific purpose for storing business_email, e.g. business_profile_verification/account_notices.';
comment on column verified_business_profiles.verification_review_url is 'External storage or manual review link for verification evidence. Do not store uploaded verification document contents in this database.';
comment on column verified_business_profiles.metadata is 'Safe metadata only. Raw IP addresses, raw user agents, and verification document blobs are forbidden.';

-- ─────────────────────────────────────────────────────────────────────────────
-- API Keys
-- Tiered access for AI consumers and business integrations.
-- ─────────────────────────────────────────────────────────────────────────────
create table api_keys (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid references verified_business_profiles(id) on delete set null,
  key_hash        text not null unique,
  key_prefix      text not null,
  name            text not null,
  tier            api_tier not null default 'free',
  rate_limit_rpm  int not null default 60,
  rate_limit_daily int not null default 1000,
  scopes          text[] not null default '{"read"}',
  is_active       boolean not null default true,
  last_used_at    timestamptz,
  expires_at      timestamptz,
  created_at      timestamptz not null default now()
);

create index api_keys_profile_id_idx on api_keys(profile_id);
create index api_keys_key_prefix_idx on api_keys(key_prefix);
create index api_keys_tier_idx on api_keys(tier);

comment on table api_keys is 'API keys for programmatic access. Keys are stored as hashes; only the prefix is readable for identification.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Business Corrections
-- Priority claim correction requests from verified businesses.
-- ─────────────────────────────────────────────────────────────────────────────
create table business_corrections (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references verified_business_profiles(id) on delete cascade,
  entity_id       text not null references entities(id) on delete restrict,
  claim_id        text references claims(id) on delete set null,
  field_path      text not null,
  current_value   text,
  proposed_value  text not null,
  reason          text not null,
  source_url      text,
  source_type     source_type not null default 'official',
  priority        correction_priority not null default 'standard',
  status          submission_status not null default 'new',
  reviewed_at     timestamptz,
  reviewer_note   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index business_corrections_profile_id_idx on business_corrections(profile_id);
create index business_corrections_entity_id_idx on business_corrections(entity_id);
create index business_corrections_status_idx on business_corrections(status);
create index business_corrections_priority_idx on business_corrections(priority);

comment on table business_corrections is 'Claim corrections submitted by verified business profiles. Priority and urgent corrections are reviewed faster but never bypass source verification.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Reputation Alerts
-- Notifications when AI systems cite incorrect information about a business.
-- ─────────────────────────────────────────────────────────────────────────────
create table reputation_alerts (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references verified_business_profiles(id) on delete cascade,
  entity_id       text not null references entities(id) on delete restrict,
  alert_type      text not null default 'incorrect_citation'
                  check (alert_type in ('incorrect_citation', 'outdated_fact', 'new_hallucination', 'claim_disputed', 'verification_expired')),
  severity        alert_severity not null default 'info',
  title           text not null,
  description     text,
  related_claim_id text references claims(id) on delete set null,
  ai_service      text,
  is_read         boolean not null default false,
  is_resolved     boolean not null default false,
  resolved_at     timestamptz,
  created_at      timestamptz not null default now()
);

create index reputation_alerts_profile_id_idx on reputation_alerts(profile_id);
create index reputation_alerts_entity_id_idx on reputation_alerts(entity_id);
create index reputation_alerts_unread_idx on reputation_alerts(profile_id) where not is_read;
create index reputation_alerts_unresolved_idx on reputation_alerts(profile_id) where not is_resolved;

comment on table reputation_alerts is 'Alerts sent to verified businesses when AI systems cite incorrect or outdated information about their entity.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Sponsored Placements
-- Clearly labeled promotional positioning within the registry.
-- ─────────────────────────────────────────────────────────────────────────────
create table sponsored_placements (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references verified_business_profiles(id) on delete cascade,
  entity_id       text not null references entities(id) on delete restrict,
  placement_type  text not null default 'category_featured'
                  check (placement_type in ('category_featured', 'search_promoted', 'related_entity')),
  category        text,
  display_label   text not null default 'Sponsored',
  target_url      text,
  is_active       boolean not null default false,
  starts_at       timestamptz,
  ends_at         timestamptz,
  impressions     bigint not null default 0,
  clicks          bigint not null default 0,
  created_at      timestamptz not null default now()
);

create index sponsored_placements_profile_id_idx on sponsored_placements(profile_id);
create index sponsored_placements_active_idx on sponsored_placements(is_active, placement_type);

comment on table sponsored_placements is 'Sponsored promotional placements. MUST always render with a visible "Sponsored" label. Never blends with verified facts.';

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS policies
-- ─────────────────────────────────────────────────────────────────────────────
alter table verified_business_profiles enable row level security;
alter table api_keys enable row level security;
alter table business_corrections enable row level security;
alter table reputation_alerts enable row level security;
alter table sponsored_placements enable row level security;

-- Public can view verified business profiles (transparency).
create policy vbp_public_select on verified_business_profiles for select to anon
  using (status = 'verified');

-- No public access to api_keys, corrections, alerts, or sponsored management.
-- All managed through admin/service-role API routes.

-- API usage tracking table (lightweight)
create table api_usage_log (
  id              uuid primary key default gen_random_uuid(),
  api_key_id      uuid references api_keys(id) on delete set null,
  endpoint        text not null,
  method          text not null default 'GET',
  response_status int,
  response_time_ms int,
  created_at      timestamptz not null default now()
);

create index api_usage_log_key_id_idx on api_usage_log(api_key_id);
create index api_usage_log_created_idx on api_usage_log(created_at desc);

-- Partition by month for performance (optional, noted for future)
comment on table api_usage_log is 'Lightweight API usage tracking for billing and rate limit enforcement. Consider partitioning by month at scale.';

-- =============================================================================
-- Webhook Subscriptions (Goal 15: Developer Experience)
-- =============================================================================

create table webhook_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid references verified_business_profiles(id) on delete set null,
  url             text not null,
  events          text[] not null default '{}',
  secret          text not null,
  is_active       boolean not null default true,
  last_triggered_at timestamptz,
  failure_count   int not null default 0,
  created_at      timestamptz not null default now()
);

create index webhook_subs_active_idx on webhook_subscriptions(is_active) where is_active = true;
create index webhook_subs_profile_idx on webhook_subscriptions(profile_id);

comment on table webhook_subscriptions is 'Webhook subscriptions for verification events. Auto-disabled after 10 consecutive failures.';
comment on column webhook_subscriptions.events is 'Array of event types: claim.verified, claim.updated, claim.disputed, document.published, document.updated, entity.created, business_profile.verified, correction.accepted, correction.rejected';
comment on column webhook_subscriptions.secret is 'HMAC-SHA256 signing secret for payload verification. Sent as X-ForAi-Signature header.';


-- Privacy/retention policy notes:
-- - Public contributors are identified only by contributor_hash derived with a secret salt; raw IP addresses are never persisted.
-- - Public intake submissions (reports, hallucination_reports, edits, topic_suggestions, topic_candidates) should be reviewed and deleted/anonymized within 180 days after final status, unless retained as accepted claim provenance.
-- - Admin audit events should be retained for 365 days, then deleted or aggregated.
-- - API usage logs should be retained for 400 days for billing/rate-limit dispute windows, then deleted or aggregated.
-- - Business emails are retained only while needed for verification/account notices and deleted or anonymized within 30 days after profile rejection/closure unless legally required.
