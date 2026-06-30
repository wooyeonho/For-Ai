import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { supabaseAdmin, requireAdmin, logAdminAuditEvent } from "@/lib/admin-api";
import { API_TIER_CONFIG, type ApiTier } from "@/lib/types-monetization";

const VALID_TIERS: ApiTier[] = ["free", "pro", "enterprise"];
const DEFAULT_SCOPES = ["read"];

function safeScopes(value: unknown): string[] {
  if (!Array.isArray(value)) return DEFAULT_SCOPES;
  const scopes = value.map(String).map((scope) => scope.trim()).filter(Boolean);
  return scopes.length ? Array.from(new Set(scopes)).slice(0, 20) : DEFAULT_SCOPES;
}

function tierConfig(tier: ApiTier) {
  return API_TIER_CONFIG[tier];
}

// GET: Admin — list API keys, recent usage logs, and derived abuse warnings.
export async function GET(request: Request) {
  const adminError = await requireAdmin(request, "api_keys.read");
  if (adminError) return adminError;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Database not configured" }, { status: 500 });

  const url = new URL(request.url);
  const profileId = url.searchParams.get("profile_id");
  const keyId = url.searchParams.get("key_id");
  const usageLimit = Math.min(Number(url.searchParams.get("usage_limit") ?? 200) || 200, 500);

  let query = sb
    .from("api_keys")
    .select("id, profile_id, key_prefix, name, tier, rate_limit_rpm, rate_limit_daily, scopes, is_active, revoked_at, last_used_at, expires_at, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (profileId) query = query.eq("profile_id", profileId);
  if (keyId) query = query.eq("id", keyId);

  const { data: keys, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const keyIds = (keys ?? []).map((key) => key.id);
  let usageLogs: unknown[] = [];
  const usageByKey: Record<string, { total: number; rate_limited: number; errors: number; last_used_at: string | null }> = {};
  let abuseWarnings: Array<{ key_id: string; warning: string; severity: "warning" | "critical"; count: number; last_seen_at: string | null }> = [];

  if (keyIds.length > 0) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: usage, error: usageError } = await sb
      .from("api_usage_events")
      .select("id, key_id, endpoint, status_code, created_at")
      .in("key_id", keyIds)
      .order("created_at", { ascending: false })
      .limit(usageLimit);

    if (usageError) return NextResponse.json({ error: usageError.message }, { status: 500 });
    usageLogs = usage ?? [];

    const recentUsage = (usage ?? []).filter((event) => String(event.created_at) >= since);
    for (const event of recentUsage) {
      const eventKeyId = String(event.key_id ?? "");
      if (!eventKeyId) continue;
      const current = usageByKey[eventKeyId] ?? { total: 0, rate_limited: 0, errors: 0, last_used_at: null };
      const status = Number(event.status_code ?? 0);
      current.total += 1;
      if (status === 429) current.rate_limited += 1;
      if (status >= 400) current.errors += 1;
      if (!current.last_used_at || String(event.created_at) > current.last_used_at) current.last_used_at = String(event.created_at);
      usageByKey[eventKeyId] = current;
    }

    abuseWarnings = Object.entries(usageByKey)
      .flatMap(([eventKeyId, stats]) => {
        const warnings: typeof abuseWarnings = [];
        if (stats.rate_limited > 0) warnings.push({ key_id: eventKeyId, warning: "Rate limit responses in the last 24 hours", severity: stats.rate_limited >= 10 ? "critical" : "warning", count: stats.rate_limited, last_seen_at: stats.last_used_at });
        if (stats.errors >= 20) warnings.push({ key_id: eventKeyId, warning: "High 4xx/5xx error volume in the last 24 hours", severity: stats.errors >= 100 ? "critical" : "warning", count: stats.errors, last_seen_at: stats.last_used_at });
        return warnings;
      })
      .sort((a, b) => b.count - a.count);
  }

  await logAdminAuditEvent(sb, request, "admin.api_key.list", { count: keys?.length ?? 0, usage_limit: usageLimit });
  return NextResponse.json({ keys: keys ?? [], usage_logs: usageLogs, usage_by_key: usageByKey, abuse_warnings: abuseWarnings });
}

// POST: Admin — create a new API key for a profile.
export async function POST(request: Request) {
  const adminError = await requireAdmin(request, "api_keys.create");
  if (adminError) return adminError;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Database not configured" }, { status: 500 });

  const body = await request.json();
  const profileId = body.profile_id ? String(body.profile_id).trim() : null;
  const name = String(body.name ?? "").trim();
  const tier = String(body.tier ?? "free").trim() as ApiTier;
  const scopes = safeScopes(body.scopes);

  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (!VALID_TIERS.includes(tier)) return NextResponse.json({ error: "Invalid tier" }, { status: 400 });

  const rawKey = `forai_${tier === "enterprise" ? "ent" : tier}_${randomBytes(24).toString("base64url")}`;
  const keyPrefix = rawKey.slice(0, 12);
  const keyHash = createHash("sha256").update(rawKey).digest("hex");
  const config = tierConfig(tier);

  const { data, error } = await sb
    .from("api_keys")
    .insert({
      profile_id: profileId,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      name,
      tier,
      rate_limit_rpm: Number(body.rate_limit_rpm ?? config.rate_limit_rpm),
      rate_limit_daily: Number(body.rate_limit_daily ?? config.rate_limit_daily),
      scopes,
      is_active: true,
      expires_at: body.expires_at ? String(body.expires_at) : null,
      revoked_at: null,
    })
    .select("id, profile_id, key_prefix, name, tier, rate_limit_rpm, rate_limit_daily, scopes, is_active, revoked_at, last_used_at, expires_at, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAuditEvent(sb, request, "admin.api_key.create", { key_id: data.id, tier, profile_id: profileId ?? "none" });
  return NextResponse.json({ key: data, raw_key: rawKey, warning: "Save this key now. It will never be shown again." }, { status: 201 });
}

// PATCH: Admin — activate/deactivate keys and update plan, limits, scopes, or expiry.
export async function PATCH(request: Request) {
  const adminError = await requireAdmin(request, "api_keys.update");
  if (adminError) return adminError;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Database not configured" }, { status: 500 });

  const body = await request.json();
  const keyId = String(body.key_id ?? "").trim();
  if (!keyId) return NextResponse.json({ error: "key_id required" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (typeof body.is_active === "boolean") {
    updates.is_active = body.is_active;
    updates.revoked_at = body.is_active ? null : new Date().toISOString();
  } else if (typeof body.revoke === "boolean") {
    updates.is_active = !body.revoke;
    updates.revoked_at = body.revoke ? new Date().toISOString() : null;
  }
  if (body.tier !== undefined) {
    const tier = String(body.tier).trim() as ApiTier;
    if (!VALID_TIERS.includes(tier)) return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
    const config = tierConfig(tier);
    updates.tier = tier;
    updates.rate_limit_rpm = Number(body.rate_limit_rpm ?? config.rate_limit_rpm);
    updates.rate_limit_daily = Number(body.rate_limit_daily ?? config.rate_limit_daily);
  }
  if (body.name !== undefined) updates.name = String(body.name).trim();
  if (body.scopes !== undefined) updates.scopes = safeScopes(body.scopes);
  if (body.expires_at !== undefined) updates.expires_at = body.expires_at ? String(body.expires_at) : null;
  if (body.rate_limit_rpm !== undefined) updates.rate_limit_rpm = Number(body.rate_limit_rpm);
  if (body.rate_limit_daily !== undefined) updates.rate_limit_daily = Number(body.rate_limit_daily);

  if (Object.keys(updates).length === 0) return NextResponse.json({ error: "No updates supplied" }, { status: 400 });

  const { data, error } = await sb
    .from("api_keys")
    .update(updates)
    .eq("id", keyId)
    .select("id, profile_id, key_prefix, name, tier, rate_limit_rpm, rate_limit_daily, scopes, is_active, revoked_at, last_used_at, expires_at, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAdminAuditEvent(sb, request, "admin.api_key.update", { key_id: keyId, fields: Object.keys(updates) });
  return NextResponse.json({ key: data });
}
