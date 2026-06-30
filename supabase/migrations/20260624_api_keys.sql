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

-- Admin API key abuse review helpers. These views keep API usage events
-- connected to keys without exposing raw key material or IP addresses.
CREATE OR REPLACE VIEW api_key_usage_24h AS
SELECT
  k.id AS key_id,
  k.key_prefix,
  k.name,
  k.tier,
  k.is_active,
  COUNT(e.id)::INTEGER AS total_24h,
  COUNT(e.id) FILTER (WHERE e.status_code >= 400)::INTEGER AS errors_24h,
  COUNT(e.id) FILTER (WHERE e.status_code = 429)::INTEGER AS rate_limited_24h,
  COALESCE(
    COUNT(e.id) FILTER (WHERE e.status_code >= 400)::NUMERIC / NULLIF(COUNT(e.id), 0),
    0
  ) AS error_rate_24h,
  MAX(e.created_at) AS last_event_at
FROM api_keys k
LEFT JOIN api_usage_events e
  ON e.key_id = k.id
 AND e.created_at >= NOW() - INTERVAL '24 hours'
GROUP BY k.id, k.key_prefix, k.name, k.tier, k.is_active;

COMMENT ON VIEW api_key_usage_24h IS 'Admin usage summary connecting api_keys to api_usage_events for the most recent 24 hours.';

CREATE OR REPLACE VIEW api_key_abuse_warnings AS
SELECT
  key_id,
  key_prefix,
  name,
  tier,
  is_active,
  total_24h,
  errors_24h,
  rate_limited_24h,
  error_rate_24h,
  ARRAY_REMOVE(ARRAY[
    CASE WHEN total_24h >= 1000 THEN 'high_usage_24h' END,
    CASE WHEN total_24h >= 20 AND error_rate_24h >= 0.20 THEN 'high_error_rate_24h' END,
    CASE WHEN rate_limited_24h > 0 THEN 'rate_limited_24h' END
  ], NULL) AS warnings
FROM api_key_usage_24h;

COMMENT ON VIEW api_key_abuse_warnings IS 'Computed warning flags for high-volume, high-error-rate, or rate-limited API keys.';

CREATE INDEX IF NOT EXISTS idx_api_usage_status_created_at ON api_usage_events (status_code, created_at DESC);
