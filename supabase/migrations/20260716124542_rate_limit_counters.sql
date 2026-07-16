-- P0 security: distributed (persistent) rate limiting.
--
-- Application rate limits were previously module-level in-memory Maps
-- (lib/rate-limit.ts, lib/api-rate-limit.ts, lib/admin-api.ts). On serverless
-- (Vercel) each cold lambda starts with an empty map and requests fan out across
-- instances, so per-minute / per-hour / per-day caps reset constantly and are
-- effectively bypassable. This backs the abuse/cost-sensitive limiters
-- (admin login, admin API, public submissions) with a shared Postgres counter so
-- the quota is enforced across every instance and region.
--
-- Privacy: `key_hash` is a sha256 of the caller key computed in the app layer
-- (lib/rate-limit-store.ts) before it ever reaches the DB, so raw IPs are never
-- stored — consistent with the project's "store contributor_hash only" invariant.
--
-- All statements are idempotent so re-running is safe.

-- ---------------------------------------------------------------------------
-- rate_limit_counters: one fixed-window bucket per (namespace, hashed key).
-- ---------------------------------------------------------------------------
create table if not exists rate_limit_counters (
  bucket             text not null,
  key_hash           text not null,
  count              integer not null default 0,
  window_started_at  timestamptz not null default now(),
  expires_at         timestamptz not null,
  primary key (bucket, key_hash)
);

create index if not exists rate_limit_counters_expires_idx
  on rate_limit_counters (expires_at);

alter table rate_limit_counters enable row level security;
-- No anon policies: the table is only ever touched by the SECURITY DEFINER
-- function below (and by service-role maintenance), never by the anon key.
drop policy if exists rate_limit_counters_public_select on rate_limit_counters;
drop policy if exists rate_limit_counters_public_insert on rate_limit_counters;
drop policy if exists rate_limit_counters_public_update on rate_limit_counters;
drop policy if exists rate_limit_counters_public_delete on rate_limit_counters;

-- ---------------------------------------------------------------------------
-- increment_rate_limit: atomically bump the counter for a fixed window and
-- report whether the caller has exceeded `p_max`. A single round-trip avoids
-- the check-then-act TOCTOU race an app-side read+write would have.
--
-- Fixed-window semantics: the first hit (or the first hit after expiry) starts a
-- new window of p_window_ms; subsequent hits within the window increment.
-- ---------------------------------------------------------------------------
create or replace function increment_rate_limit(
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
  insert into rate_limit_counters as r (bucket, key_hash, count, window_started_at, expires_at)
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

-- Only the service-role API layer calls this; the anon key never does.
revoke all on function increment_rate_limit(text, text, integer, bigint) from public;
grant execute on function increment_rate_limit(text, text, integer, bigint) to service_role;
