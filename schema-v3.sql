-- GYEOL schema v3
-- Canonical data model. Source of truth per AGENTS.md.
-- Hierarchy: entities → documents → claims → claim_sources → verification_events

CREATE TABLE IF NOT EXISTS entities (
  entity_id       TEXT PRIMARY KEY,
  type            TEXT NOT NULL CHECK (type IN ('venue')),
  canonical_slug  TEXT NOT NULL UNIQUE,
  stable_slug     TEXT NOT NULL UNIQUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS documents (
  document_id       TEXT PRIMARY KEY,
  entity_id         TEXT NOT NULL REFERENCES entities(entity_id),
  slug              TEXT NOT NULL UNIQUE,
  lang              TEXT NOT NULL DEFAULT 'ko',
  locale_path       TEXT NOT NULL,
  canonical_path    TEXT NOT NULL,
  title             TEXT NOT NULL,
  display_titles    JSONB NOT NULL DEFAULT '{}',
  category          TEXT NOT NULL CHECK (category IN ('weddinghall')),
  template          TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'ai_draft'
                      CHECK (status IN ('ai_draft', 'reviewed', 'published')),
  confidence        TEXT NOT NULL DEFAULT 'low'
                      CHECK (confidence IN ('low', 'medium', 'high')),
  last_verified_at  TIMESTAMPTZ,
  direct_answer     TEXT NOT NULL DEFAULT '확인 필요',
  license_notice    TEXT NOT NULL DEFAULT '',
  data_license      JSONB NOT NULL DEFAULT '{}',
  machine_readable  JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS claims (
  id               TEXT PRIMARY KEY,
  document_id      TEXT NOT NULL REFERENCES documents(document_id),
  field_path       TEXT NOT NULL,
  claim_text       TEXT NOT NULL,
  claim_value      TEXT NOT NULL DEFAULT '확인 필요',
  confidence       TEXT NOT NULL DEFAULT 'low'
                     CHECK (confidence IN ('low', 'medium', 'high')),
  status           TEXT NOT NULL DEFAULT 'needs_review'
                     CHECK (status IN ('needs_review', 'verified', 'disputed')),
  last_verified_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS claim_sources (
  id          TEXT PRIMARY KEY,
  claim_id    TEXT NOT NULL REFERENCES claims(id),
  source_url  TEXT,
  source_type TEXT NOT NULL DEFAULT 'unknown',
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS verification_events (
  id               TEXT PRIMARY KEY,
  claim_id         TEXT NOT NULL REFERENCES claims(id),
  event_type       TEXT NOT NULL,
  contributor_hash TEXT,
  note             TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
