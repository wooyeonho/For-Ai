import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { supabaseAdmin, requireAdmin, logAdminAuditEvent } from "@/lib/admin-api";
import { API_TIER_CONFIG } from "@/lib/types-monetization";

// GET: Admin — list API keys (with usage stats)
export async function GET(request: Request) {
  const adminError = requireAdmin(request, "api_keys.read");
  if (adminError) return adminError;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Database not configured" }, { status: 500 });

  const url = new URL(request.url);
  const profileId = url.searchParams.get("profile_id");

  let query = sb
    .from("api_keys")
    .select("id, profile_id, key_prefix, name, tier, rate_limit_rpm, rate_limit_daily, scopes, is_active, revoked_at, last_used_at, expires_at, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (profileId) query = query.eq("profile_id", profileId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ keys: data ?? [] });
}

// POST: Admin — create a new API key for a profile
export async function POST(request: Request) {
  const adminError = requireAdmin(request, "api_keys.create");
  if (adminError) return adminError;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Database not configured" }, { status: 500 });

  const body = await request.json();
  const profileId = body.profile_id ? String(body.profile_id).trim() : null;
  const name = String(body.name ?? "").trim();
  const tier = String(body.tier ?? "free").trim();
  const scopes = Array.isArray(body.scopes) ? body.scopes.map(String) : ["read"];

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!["free", "pro", "enterprise"].includes(tier)) {
    return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
  }

  // Generate API key: forai_<tier_prefix>_<random>
  const tierPrefix = tier === "enterprise" ? "ent" : tier === "pro" ? "pro" : "free";
  const rawKey = `forai_${tierPrefix}_${randomBytes(24).toString("base64url")}`;
  const keyPrefix = rawKey.slice(0, 12);
  const keyHash = createHash("sha256").update(rawKey).digest("hex");

  const tierConfig = API_TIER_CONFIG[tier as keyof typeof API_TIER_CONFIG];

  const { data, error } = await sb
    .from("api_keys")
    .insert({
      profile_id: profileId,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      name,
      tier,
      rate_limit_rpm: tierConfig.rate_limit_rpm,
      rate_limit_daily: tierConfig.rate_limit_daily,
      scopes,
      is_active: true,
      revoked_at: null,
    })
    .select("id, key_prefix, name, tier, rate_limit_rpm, rate_limit_daily, scopes, is_active, revoked_at, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAuditEvent(sb, request, "admin.api_key.create", {
    key_id: data.id,
    tier,
    profile_id: profileId ?? "none",
  });

  // Return the raw key only on creation (never stored or shown again)
  return NextResponse.json({
    key: data,
    raw_key: rawKey,
    warning: "Save this key now. It will never be shown again.",
  }, { status: 201 });
}

// PATCH: Admin — revoke or restore an API key
export async function PATCH(request: Request) {
  const adminError = requireAdmin(request, "api_keys.update");
  if (adminError) return adminError;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Database not configured" }, { status: 500 });

  const body = await request.json();
  const keyId = String(body.key_id ?? "").trim();
  const revoke = body.revoke;

  if (!keyId || typeof revoke !== "boolean") {
    return NextResponse.json({ error: "key_id and revoke (boolean) required" }, { status: 400 });
  }

  const { data, error } = await sb
    .from("api_keys")
    .update({
      is_active: !revoke,
      revoked_at: revoke ? new Date().toISOString() : null,
    })
    .eq("id", keyId)
    .select("id, key_prefix, name, is_active, revoked_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAuditEvent(sb, request, "admin.api_key.revoke", {
    key_id: keyId,
    revoke,
  });

  return NextResponse.json({ key: data });
}
