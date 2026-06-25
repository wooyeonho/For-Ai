import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { API_TIER_CONFIG, type ApiTier } from "./types-monetization";
import { supabaseAdmin } from "./admin-api";

interface RateBucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateBucket>();
const WINDOW_MS = 60_000;

function clientFingerprint(request: Request): string {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip")
    ?? "unknown";
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

interface AuthResult {
  tier: ApiTier;
  profileId: string | null;
  keyId: string | null;
}

async function authenticateApiKey(request: Request): Promise<AuthResult | null> {
  const apiKey = request.headers.get("x-api-key") ?? request.headers.get("authorization")?.replace("Bearer ", "");
  if (!apiKey) return null;

  const sb = supabaseAdmin();
  if (!sb) return null;

  const keyHash = createHash("sha256").update(apiKey).digest("hex");
  const { data } = await sb
    .from("api_keys")
    .select("id, profile_id, tier, is_active")
    .eq("key_hash", keyHash)
    .eq("is_active", true)
    .single();

  if (!data) return null;

  // Update last_used_at
  await sb.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);

  return {
    tier: data.tier as ApiTier,
    profileId: data.profile_id,
    keyId: data.id,
  };
}

interface RateLimitResult {
  allowed: boolean;
  tier: ApiTier;
  limit: number;
  remaining: number;
  resetAt: number;
  profileId: string | null;
}

export async function checkRateLimit(request: Request): Promise<RateLimitResult> {
  const now = Date.now();
  const auth = await authenticateApiKey(request);
  const tier: ApiTier = auth?.tier ?? "free";
  const tierConfig = API_TIER_CONFIG[tier];
  const limit = tierConfig.rate_limit_rpm;

  const bucketKey = auth?.keyId ?? `anon:${clientFingerprint(request)}`;
  const bucket = buckets.get(bucketKey);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(bucketKey, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, tier, limit, remaining: limit - 1, resetAt: now + WINDOW_MS, profileId: auth?.profileId ?? null };
  }

  bucket.count += 1;
  const remaining = Math.max(0, limit - bucket.count);
  const allowed = bucket.count <= limit;

  return { allowed, tier, limit, remaining, resetAt: bucket.resetAt, profileId: auth?.profileId ?? null };
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
    "X-API-Tier": result.tier,
  };
}

export function rateLimitResponse(result: RateLimitResult): NextResponse {
  const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
  return NextResponse.json(
    {
      error: "rate_limit_exceeded",
      tier: result.tier,
      retry_after_seconds: retryAfter,
      upgrade_url: "/api-docs#pricing",
    },
    {
      status: 429,
      headers: {
        ...rateLimitHeaders(result),
        "Retry-After": String(retryAfter),
      },
    },
  );
}
