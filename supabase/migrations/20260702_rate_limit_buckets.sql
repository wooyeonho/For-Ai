-- Shared fixed-window rate limiting store. key_hash contains salted contributor
-- hashes or API key hashes only; raw IP addresses are never stored.
CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  scope      TEXT NOT NULL,
  key_hash   TEXT NOT NULL,
  count      INTEGER NOT NULL DEFAULT 0,
  reset_at   TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (scope, key_hash)
);

COMMENT ON TABLE rate_limit_buckets IS 'Shared fixed-window rate-limit counters keyed by salted contributor hash or API key hash. Raw IP addresses are forbidden.';
COMMENT ON COLUMN rate_limit_buckets.key_hash IS 'Salted contributor_hash, admin actor hash, or SHA-256 API key hash; never a raw IP address.';

ALTER TABLE rate_limit_buckets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_manages_rate_limit_buckets"
  ON rate_limit_buckets
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_reset_at ON rate_limit_buckets (reset_at);

CREATE OR REPLACE FUNCTION check_rate_limit(
  p_scope TEXT,
  p_key_hash TEXT,
  p_limit INTEGER,
  p_window_ms INTEGER
)
RETURNS TABLE(allowed BOOLEAN, count INTEGER, remaining INTEGER, reset_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_window INTERVAL := make_interval(secs => GREATEST(p_window_ms, 1) / 1000.0);
  v_count INTEGER;
  v_reset_at TIMESTAMPTZ;
BEGIN
  IF p_scope IS NULL OR p_scope = '' OR p_key_hash IS NULL OR p_key_hash = '' THEN
    RAISE EXCEPTION 'scope and key_hash are required';
  END IF;
  IF p_limit < 1 THEN
    RAISE EXCEPTION 'limit must be positive';
  END IF;

  INSERT INTO rate_limit_buckets AS b (scope, key_hash, count, reset_at, updated_at)
  VALUES (p_scope, p_key_hash, 1, v_now + v_window, v_now)
  ON CONFLICT (scope, key_hash) DO UPDATE
    SET count = CASE
          WHEN b.reset_at <= v_now THEN 1
          ELSE b.count + 1
        END,
        reset_at = CASE
          WHEN b.reset_at <= v_now THEN v_now + v_window
          ELSE b.reset_at
        END,
        updated_at = v_now
  RETURNING b.count, b.reset_at INTO v_count, v_reset_at;

  RETURN QUERY SELECT
    v_count <= p_limit,
    v_count,
    GREATEST(p_limit - v_count, 0),
    v_reset_at;
END;
$$;

GRANT EXECUTE ON FUNCTION check_rate_limit(TEXT, TEXT, INTEGER, INTEGER) TO service_role;
