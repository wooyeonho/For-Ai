-- topic_candidates: AI/user-generated knowledge candidates (NOT verified facts)
CREATE TABLE IF NOT EXISTS topic_candidates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status         TEXT NOT NULL DEFAULT 'new'
                 CHECK (status IN ('new','triaged','generated','rejected','promoted')),
  source         TEXT NOT NULL DEFAULT 'ai_generated'
                 CHECK (source IN ('ai_generated','user_suggested','admin_created','correction_report','hallucination_report')),
  lang           TEXT NOT NULL DEFAULT 'ko',
  title          TEXT NOT NULL,
  slug           TEXT NOT NULL UNIQUE,
  category       TEXT NOT NULL,
  subcategory    TEXT,
  risk_tier      TEXT NOT NULL DEFAULT 'medium'
                 CHECK (risk_tier IN ('low','medium','high','forbidden')),
  why_people_ask_ai  TEXT,
  why_ai_gets_wrong  TEXT,
  claims         JSONB NOT NULL DEFAULT '[]',
  source_hints   JSONB DEFAULT '[]',
  contributor_hash TEXT,
  generation_model TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at    TIMESTAMPTZ,
  promoted_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS topic_candidates_status_idx   ON topic_candidates(status);
CREATE INDEX IF NOT EXISTS topic_candidates_category_idx ON topic_candidates(category);
CREATE INDEX IF NOT EXISTS topic_candidates_created_idx  ON topic_candidates(created_at DESC);

ALTER TABLE topic_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_insert_topic_candidates"
  ON topic_candidates FOR INSERT TO anon
  WITH CHECK (source IN ('user_suggested','correction_report','hallucination_report') AND status = 'new');

-- No public SELECT/UPDATE policies: candidate review data is admin-only via service-role API routes.
