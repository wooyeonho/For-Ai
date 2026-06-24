-- API key table for tiered access
-- key_hash: SHA-256(raw_key) — raw key is NEVER stored
CREATE TABLE IF NOT EXISTS api_keys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash      TEXT NOT NULL UNIQUE,
  tier          TEXT NOT NULL DEFAULT 'free'
                  CHECK (tier IN ('free', 'pro', 'enterprise')),
  label         TEXT,
  owner_email   TEXT,
  daily_limit   INTEGER NOT NULL DEFAULT 1000,
  rate_limit_rpm INTEGER NOT NULL DEFAULT 60,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at  TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ
);

-- Only service role can read/write; no public access
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_only"
  ON api_keys
  USING (auth.role() = 'service_role');

-- Index for fast lookup by hash
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys (key_hash);

-- Usage tracking table (optional, for analytics)
CREATE TABLE IF NOT EXISTS api_usage_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id       UUID REFERENCES api_keys(id) ON DELETE CASCADE,
  endpoint     TEXT NOT NULL,
  ip_hash      TEXT,
  status_code  SMALLINT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE api_usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_only_usage"
  ON api_usage_events
  USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_api_usage_key_id ON api_usage_events (key_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_created_at ON api_usage_events (created_at DESC);
