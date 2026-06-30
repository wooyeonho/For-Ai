-- API key table for tiered access.
-- Raw API keys are shown once at creation time only and are NEVER stored.
CREATE TABLE IF NOT EXISTS api_keys (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id       UUID REFERENCES verified_business_profiles(id) ON DELETE SET NULL,
  key_hash         TEXT NOT NULL UNIQUE,
  key_prefix       TEXT NOT NULL,
  name             TEXT NOT NULL,
  tier             TEXT NOT NULL DEFAULT 'free'
                     CHECK (tier IN ('free', 'pro', 'enterprise')),
  rate_limit_rpm   INTEGER NOT NULL DEFAULT 60,
  rate_limit_daily INTEGER NOT NULL DEFAULT 1000,
  scopes           TEXT[] NOT NULL DEFAULT '{read}',
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  last_used_at     TIMESTAMPTZ,
  expires_at       TIMESTAMPTZ,
  revoked_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT api_keys_prefix_is_identifier_only CHECK (POSITION(key_prefix IN key_hash) = 0)
);

COMMENT ON TABLE api_keys IS 'API keys for programmatic access. Raw keys are never stored; key_hash is used for authentication and key_prefix is stored only for identification.';
COMMENT ON COLUMN api_keys.key_hash IS 'SHA-256(raw_key). The raw key is displayed once during creation only.';
COMMENT ON COLUMN api_keys.key_prefix IS 'Short non-secret prefix for admin identification only; never authenticate with this value.';
COMMENT ON COLUMN api_keys.revoked_at IS 'Non-null means the key is revoked and must not authenticate.';

-- Only service role can read/write; no public access.
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_only"
  ON api_keys
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Indexes for lookup and admin filtering.
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys (key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_profile_id ON api_keys (profile_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys (key_prefix);
CREATE INDEX IF NOT EXISTS idx_api_keys_tier ON api_keys (tier);
CREATE INDEX IF NOT EXISTS idx_api_keys_revoked_at ON api_keys (revoked_at);

-- Lightweight usage tracking for billing/rate-limit analytics.
-- Do not store raw IPs here. Abuse detection should use contributor_hash for
-- anonymous/public submissions or api_keys.key_hash for authenticated API calls.
CREATE TABLE IF NOT EXISTS api_usage_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id       UUID REFERENCES api_keys(id) ON DELETE SET NULL,
  endpoint     TEXT NOT NULL,
  status_code  SMALLINT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE api_usage_events IS 'Minimal API usage log: key id, endpoint, response status, and timestamp only. No raw IP address is stored.';

ALTER TABLE api_usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_only_usage"
  ON api_usage_events
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_api_usage_key_id ON api_usage_events (key_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_created_at ON api_usage_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_status_created_at ON api_usage_events (status_code, created_at DESC);

COMMENT ON COLUMN api_usage_events.key_id IS 'Connects each usage event to api_keys for admin usage logs, tier operations, and abuse-warning review.';
COMMENT ON COLUMN api_usage_events.status_code IS 'Used by admin tooling to derive abuse warnings such as rate-limit responses and elevated 4xx/5xx volume.';
