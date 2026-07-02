import { createHash } from "crypto";
import { createServiceRoleClient } from "./supabase-server";
import { extractIp, makeContributorHashForRequest } from "./contributor-hash";

// External shared-store rate limiter.
// Inventory replaced in this change:
// - lib/rate-limit.ts previously used `stores: Map<scope, Map<key, Bucket>>` for public endpoints.
// - lib/api-rate-limit.ts previously used `buckets: Map<key, Bucket>` for API key/free API quotas.
// - lib/admin-api.ts previously used `buckets: Map<hashed-ip, Bucket>` before admin auth.
// Supabase table `rate_limit_buckets` is the selected shared store so limits are
// enforced across instances without storing raw IP addresses.

export type RateLimitCheck = {
  allowed: boolean;
  scope: string;
  key: string;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
  store: "supabase" | "unavailable";
};

type RateLimitRpcRow = {
  allowed: boolean;
  count: number;
  remaining: number;
  reset_at: string;
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function clientIp(request: Request): string {
  return extractIp(request);
}

export function publicRateLimitKey(request: Request, suffix?: string): string {
  const contributorHash = makeContributorHashForRequest(request);
  return suffix ? `contributor:${contributorHash}:${suffix}` : `contributor:${contributorHash}`;
}

export function hashedFallbackKey(prefix: string, value: string): string {
  return `${prefix}:${sha256(value).slice(0, 32)}`;
}

export async function checkRateLimit(
  scope: string,
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitCheck> {
  const now = Date.now();
  const resetAtIfUnavailable = now + windowMs;
  const sb = createServiceRoleClient();

  if (!sb) {
    return { allowed: true, scope, key, limit, remaining: limit, resetAt: resetAtIfUnavailable, retryAfterSeconds: 0, store: "unavailable" };
  }

  const { data, error } = await sb.rpc("check_rate_limit", {
    p_scope: scope,
    p_key_hash: key,
    p_limit: limit,
    p_window_ms: windowMs,
  });

  if (error || !data) {
    console.error("[rate-limit] shared store check failed", { scope, code: error?.code, message: error?.message });
    return { allowed: true, scope, key, limit, remaining: limit, resetAt: resetAtIfUnavailable, retryAfterSeconds: 0, store: "unavailable" };
  }

  const row = (Array.isArray(data) ? data[0] : data) as RateLimitRpcRow;
  const resetAt = Date.parse(row.reset_at);
  const safeResetAt = Number.isFinite(resetAt) ? resetAt : resetAtIfUnavailable;
  return {
    allowed: row.allowed,
    scope,
    key,
    limit,
    remaining: Math.max(0, Number(row.remaining ?? 0)),
    resetAt: safeResetAt,
    retryAfterSeconds: Math.max(0, Math.ceil((safeResetAt - now) / 1000)),
    store: "supabase",
  };
}

export async function rateLimited(namespace: string, key: string, max: number, windowMs: number): Promise<boolean> {
  const result = await checkRateLimit(namespace, key, max, windowMs);
  return !result.allowed;
}
