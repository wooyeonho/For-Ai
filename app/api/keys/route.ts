import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { supabaseAdmin, requireAdmin, logAdminAuditEvent } from "@/lib/admin-api";
import { API_TIER_CONFIG, type ApiTier } from "@/lib/types-monetization";

const TIERS = ["free", "pro", "enterprise"] as const;
const HIGH_USAGE_24H = 1000;
const HIGH_ERROR_RATE = 0.2;
const MIN_ERROR_SAMPLE = 20;

type UsageEvent = { key_id: string | null; endpoint: string; status_code: number | null; created_at: string };
type ApiKeyRow = {
  id: string; profile_id: string | null; key_prefix: string; name: string; tier: ApiTier;
  rate_limit_rpm: number; rate_limit_daily: number; scopes: string[]; is_active: boolean;
  revoked_at: string | null; last_used_at: string | null; expires_at: string | null; created_at: string;
};

function isTier(value: string): value is ApiTier {
  return TIERS.includes(value as ApiTier);
}

function warningFor(total24h: number, errorRate24h: number, rateLimited24h: number) {
  const warnings: string[] = [];
  if (total24h >= HIGH_USAGE_24H) warnings.push(`High usage: ${total24h.toLocaleString("en-US")} requests in 24h`);
  if (total24h >= MIN_ERROR_SAMPLE && errorRate24h >= HIGH_ERROR_RATE) warnings.push(`High error rate: ${(errorRate24h * 100).toFixed(1)}% in 24h`);
  if (rateLimited24h > 0) warnings.push(`Rate limited: ${rateLimited24h.toLocaleString("en-US")} events in 24h`);
  return warnings;
}

function summarizeUsage(keys: ApiKeyRow[], events: UsageEvent[]) {
  const byKey = new Map(keys.map((key) => [key.id, { total24h: 0, errors24h: 0, rateLimited24h: 0, last_events: [] as UsageEvent[] }]));
  for (const event of events) {
    if (!event.key_id || !byKey.has(event.key_id)) continue;
    const bucket = byKey.get(event.key_id)!;
    bucket.total24h += 1;
    if ((event.status_code ?? 0) >= 400) bucket.errors24h += 1;
    if ((event.status_code ?? 0) === 429) bucket.rateLimited24h += 1;
    if (bucket.last_events.length < 5) bucket.last_events.push(event);
  }
  return keys.map((key) => {
    const usage = byKey.get(key.id) ?? { total24h: 0, errors24h: 0, rateLimited24h: 0, last_events: [] };
    const errorRate24h = usage.total24h ? usage.errors24h / usage.total24h : 0;
    const warnings = warningFor(usage.total24h, errorRate24h, usage.rateLimited24h);
    return { ...key, usage_24h: { ...usage, error_rate: errorRate24h }, abuse_warnings: warnings, warning_level: warnings.length ? "warning" : "ok" };
  });
}

// GET: Admin — list API keys with usage logs and computed abuse warnings.
export async function GET(request: Request) {
  const adminError = await requireAdmin(request, "api_keys.read");
  if (adminError) return adminError;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Database not configured" }, { status: 500 });

  const url = new URL(request.url);
  const profileId = url.searchParams.get("profile_id");
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  let query = sb
    .from("api_keys")
    .select("id, profile_id, key_prefix, name, tier, rate_limit_rpm, rate_limit_daily, scopes, is_active, revoked_at, last_used_at, expires_at, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (profileId) query = query.eq("profile_id", profileId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const keys = (data ?? []) as ApiKeyRow[];
  const keyIds = keys.map((key) => key.id);
  let events: UsageEvent[] = [];
  if (keyIds.length) {
    const { data: usageRows, error: usageError } = await sb
      .from("api_usage_events")
      .select("key_id, endpoint, status_code, created_at")
      .in("key_id", keyIds)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (usageError) return NextResponse.json({ error: usageError.message }, { status: 500 });
    events = (usageRows ?? []) as UsageEvent[];
  }

  return NextResponse.json({ keys: summarizeUsage(keys, events), usage_window_hours: 24, warning_thresholds: { high_usage_24h: HIGH_USAGE_24H, high_error_rate: HIGH_ERROR_RATE, min_error_sample: MIN_ERROR_SAMPLE } });
}

// POST: Admin — create a new API key.
export async function POST(request: Request) {
  const adminError = await requireAdmin(request, "api_keys.create");
  if (adminError) return adminError;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Database not configured" }, { status: 500 });

  const body = await request.json();
  const profileId = body.profile_id ? String(body.profile_id).trim() : null;
  const name = String(body.name ?? "").trim();
  const tier = String(body.tier ?? "free").trim();
  const scopes = Array.isArray(body.scopes) ? body.scopes.map(String) : ["read"];

  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (!isTier(tier)) return NextResponse.json({ error: "Invalid tier" }, { status: 400 });

  const tierPrefix = tier === "enterprise" ? "ent" : tier === "pro" ? "pro" : "free";
  const rawKey = `forai_${tierPrefix}_${randomBytes(24).toString("base64url")}`;
  const keyPrefix = rawKey.slice(0, 12);
  const keyHash = createHash("sha256").update(rawKey).digest("hex");
  const tierConfig = API_TIER_CONFIG[tier];

  const { data, error } = await sb
    .from("api_keys")
    .insert({ profile_id: profileId, key_hash: keyHash, key_prefix: keyPrefix, name, tier, rate_limit_rpm: tierConfig.rate_limit_rpm, rate_limit_daily: tierConfig.rate_limit_daily, scopes, is_active: true, revoked_at: null })
    .select("id, key_prefix, name, tier, rate_limit_rpm, rate_limit_daily, scopes, is_active, revoked_at, created_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAuditEvent(sb, request, "admin.api_key.create", { key_id: data.id, tier, profile_id: profileId ?? "none" });
  return NextResponse.json({ key: data, raw_key: rawKey, warning: "Save this key now. It will never be shown again." }, { status: 201 });
}

// PATCH: Admin — deactivate/reactivate and update plan/tier.
export async function PATCH(request: Request) {
  const adminError = await requireAdmin(request, "api_keys.update");
  if (adminError) return adminError;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Database not configured" }, { status: 500 });

  const body = await request.json();
  const keyId = String(body.key_id ?? "").trim();
  if (!keyId) return NextResponse.json({ error: "key_id is required" }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (typeof body.revoke === "boolean") {
    update.is_active = !body.revoke;
    update.revoked_at = body.revoke ? new Date().toISOString() : null;
  }
  if (body.tier != null) {
    const tier = String(body.tier).trim();
    if (!isTier(tier)) return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
    const tierConfig = API_TIER_CONFIG[tier];
    update.tier = tier;
    update.rate_limit_rpm = tierConfig.rate_limit_rpm;
    update.rate_limit_daily = tierConfig.rate_limit_daily;
  }
  if (!Object.keys(update).length) return NextResponse.json({ error: "No supported updates provided" }, { status: 400 });

  const { data, error } = await sb
    .from("api_keys")
    .update(update)
    .eq("id", keyId)
    .select("id, key_prefix, name, tier, rate_limit_rpm, rate_limit_daily, is_active, revoked_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAuditEvent(sb, request, "admin.api_key.update", { key_id: keyId, fields: Object.keys(update) });
  return NextResponse.json({ key: data });
}
