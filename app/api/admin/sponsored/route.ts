import { NextResponse } from "next/server";
import { logAdminAuditEvent, requireAdmin, supabaseAdmin } from "@/lib/admin-api";

const PLACEMENT_TYPES = new Set(["category_featured", "search_promoted", "related_entity"]);

function cleanString(value: unknown, max = 500): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function sponsoredLabel(value: unknown): string {
  const label = cleanString(value, 80) ?? "Sponsored";
  return label.toLowerCase().includes("sponsored") || label.toLowerCase().includes("ad") ? label : `Sponsored · ${label}`;
}

function placementPayload(body: Record<string, unknown>) {
  const placementType = cleanString(body.placement_type, 40) ?? "category_featured";
  if (!PLACEMENT_TYPES.has(placementType)) throw new Error("invalid placement_type");
  const entityId = cleanString(body.entity_id, 160);
  const profileId = cleanString(body.profile_id, 160);
  if (!entityId) throw new Error("entity_id is required");
  if (!profileId) throw new Error("profile_id is required");

  return {
    profile_id: profileId,
    entity_id: entityId,
    placement_type: placementType,
    category: cleanString(body.category, 120),
    display_label: sponsoredLabel(body.display_label),
    target_url: cleanString(body.target_url, 1000),
    is_active: Boolean(body.is_active),
    starts_at: cleanString(body.starts_at, 80),
    ends_at: cleanString(body.ends_at, 80),
  };
}

export async function GET(request: Request) {
  const adminError = await requireAdmin(request, "sponsored.read");
  if (adminError) return adminError;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });

  const url = new URL(request.url);
  const active = url.searchParams.get("active");
  let query = sb
    .from("sponsored_placements")
    .select("*, verified_business_profiles(business_name, status)")
    .order("created_at", { ascending: false })
    .limit(Math.min(Number(url.searchParams.get("limit") ?? 100), 500));
  if (active === "true" || active === "false") query = query.eq("is_active", active === "true");
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ placements: data ?? [], count: data?.length ?? 0 });
}

export async function POST(request: Request) {
  const adminError = await requireAdmin(request, "sponsored.create");
  if (adminError) return adminError;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  let payload: ReturnType<typeof placementPayload>;
  try { payload = placementPayload(body); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "invalid payload" }, { status: 400 }); }
  const { data, error } = await sb.from("sponsored_placements").insert(payload).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAdminAuditEvent(sb, request, "admin.sponsored.create", { sponsored_placement_id: data.id, entity_id: payload.entity_id, is_active: payload.is_active });
  return NextResponse.json({ success: true, id: data.id }, { status: 201 });
}

export async function PATCH(request: Request) {
  const adminError = await requireAdmin(request, "sponsored.update");
  if (adminError) return adminError;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const id = cleanString(body.id, 160);
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  let payload: ReturnType<typeof placementPayload>;
  try { payload = placementPayload(body); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "invalid payload" }, { status: 400 }); }
  const { error } = await sb.from("sponsored_placements").update(payload).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAdminAuditEvent(sb, request, "admin.sponsored.update", { sponsored_placement_id: id, entity_id: payload.entity_id, is_active: payload.is_active });
  return NextResponse.json({ success: true });
}
