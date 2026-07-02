// Persistent, distributed rate limiting backed by Postgres (Supabase).
//
// The in-memory limiter in ./rate-limit is per-instance: on serverless each
// cold worker keeps its own Map, so caps reset across instances and are
// effectively bypassable. This module enforces the same fixed-window semantics
// through the `increment_rate_limit` SQL function (see
// supabase/migrations/20260703_rate_limit_counters.sql) so a quota holds across
// every region/instance.
//
// It degrades gracefully: when Supabase is not configured (local dev, tests,
// or a misprovisioned deploy) or the RPC fails, it falls back to the in-memory
// limiter so the endpoint is never left completely unguarded and never hard-errors.
//
// Privacy: the caller key is sha256-hashed here before it reaches the DB, so raw
// IPs are never persisted (matches the "store contributor_hash only" invariant).

import { createHash } from "crypto";
import { createServiceRoleClient } from "./supabase-server";
import { rateLimited as inMemoryRateLimited } from "./rate-limit";

export interface RateLimitOutcome {
  limited: boolean;
  retryAfterMs: number;
  backend: "postgres" | "memory";
}

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Atomically increment the fixed-window counter for (namespace, key) and report
 * whether the caller has EXCEEDED `max` within `windowMs`.
 *
 * @param namespace logical bucket group (e.g. "admin-login", "submission-minute")
 * @param key per-caller key (ip, contributor hash, or a composite) — hashed before storage
 * @param max max requests allowed per window
 * @param windowMs window length in ms
 */
export async function persistentRateLimited(
  namespace: string,
  key: string,
  max: number,
  windowMs: number,
): Promise<RateLimitOutcome> {
  const sb = createServiceRoleClient();
  if (sb) {
    try {
      const { data, error } = await sb.rpc("increment_rate_limit", {
        p_bucket: namespace,
        p_key_hash: hashKey(key),
        p_max: max,
        p_window_ms: windowMs,
      });
      if (!error && data && typeof data === "object") {
        const result = data as { limited?: boolean; reset_at_ms?: number };
        const resetAt = typeof result.reset_at_ms === "number" ? result.reset_at_ms : Date.now() + windowMs;
        return {
          limited: Boolean(result.limited),
          retryAfterMs: Math.max(0, resetAt - Date.now()),
          backend: "postgres",
        };
      }
      // Fall through to in-memory on RPC error (e.g. migration not yet applied).
      if (error) {
        console.warn("[rate-limit-store] increment_rate_limit RPC failed, using in-memory fallback", {
          namespace,
          message: error.message,
          code: error.code,
        });
      }
    } catch (err) {
      console.warn("[rate-limit-store] increment_rate_limit threw, using in-memory fallback", {
        namespace,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const limited = inMemoryRateLimited(namespace, key, max, windowMs);
  return { limited, retryAfterMs: limited ? windowMs : 0, backend: "memory" };
}
