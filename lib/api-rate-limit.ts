import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { API_TIER_CONFIG, type ApiTier } from "./types-monetization";
import { supabaseAdmin } from "./admin-api";
import { checkRateLimit as checkSharedRateLimit, publicRateLimitKey } from "./rate-limit";

const WINDOW_MS = 60_000;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

interface AuthResult {
  tier: ApiTier;
  profileId: string | null;
  keyId: string | null;
  keyHash: string;
}

function bearerToken(value: string | null): string | null {
  if (!value) return null;
  const [scheme, token] = value.split(/\s+/, 2);
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

export async function authenticateApiKey(request: Request): Promise<AuthResult | null> {
  const apiKey = request.headers.get("x-api-key") ?? bearerToken(request.headers.get("authorization"));
  if (!apiKey) return null;

  const sb = supabaseAdmin();
  if (!sb) return null;

  const keyHash = sha256(apiKey);
  const { data } = await sb
    .from("api_keys")
    .select("id, profile_id, tier, is_active, revoked_at")
    .eq("key_hash", keyHash)
    .is("revoked_at", null)
    .single();

  if (!data || data.is_active === false) return null;

  await sb.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);

  return {
    tier: data.tier as ApiTier,
    profileId: data.profile_id,
    keyId: data.id,
    keyHash,
  };
}

interface RateLimitResult {
  allowed: boolean;
  tier: ApiTier;
  limit: number;
  remaining: number;
  resetAt: number;
  profileId: string | null;
  keyId: string | null;
}

export async function checkRateLimit(request: Request): Promise<RateLimitResult> {
  const auth = await authenticateApiKey(request);
  const tier: ApiTier = auth?.tier ?? "free";
  const tierConfig = API_TIER_CONFIG[tier];
  const limit = tierConfig.rate_limit_rpm;
  const bucketKey = auth ? `api-key:${auth.keyHash}` : publicRateLimitKey(request, "api");
  const result = await checkSharedRateLimit("api", bucketKey, limit, WINDOW_MS);

  return {
    allowed: result.allowed,
    tier,
    limit,
    remaining: result.remaining,
    resetAt: result.resetAt,
    profileId: auth?.profileId ?? null,
    keyId: auth?.keyId ?? null,
  };
}

export async function logApiUsage(request: Request, result: RateLimitResult, responseStatus: number): Promise<void> {
  if (!result.keyId) return;
  const sb = supabaseAdmin();
  if (!sb) return;

  const endpoint = new URL(request.url).pathname;
  await sb.from("api_usage_events").insert({
    key_id: result.keyId,
    endpoint,
    status_code: responseStatus,
  });
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
