import { NextResponse } from "next/server";
import { supabaseAdmin, requireAdmin, logAdminAuditEvent } from "@/lib/admin-api";
import { SPONSORED_NOT_FACTUAL_CLAIM_LABEL } from "@/lib/types-monetization";

export async function GET(request: Request) {
  const adminError = await requireAdmin(request, "business_profiles.read");
  if (adminError) return adminError;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Database not configured" }, { status: 500 });

  const url = new URL(request.url);
  const active = url.searchParams.get("active");
  let query = sb.from("sponsored_placements").select("*, verified_business_profiles(business_name, tier)").order("created_at", { ascending: false }).limit(100);
  if (active === "true") query = query.eq("is_active", true);
  if (active === "false") query = query.eq("is_active", false);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ placements: data ?? [] });
}

export async function PATCH(request: Request) {
  const adminError = await requireAdmin(request, "business_profiles.update");
  if (adminError) return adminError;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Database not configured" }, { status: 500 });

  const body = await request.json();
  const placementId = String(body.placement_id ?? "").trim();
  const action = String(body.action ?? "").trim();
  const displayLabel = String(body.display_label ?? SPONSORED_NOT_FACTUAL_CLAIM_LABEL).trim();

  if (!placementId || !["approve", "reject", "label", "disable"].includes(action)) {
    return NextResponse.json({ error: "placement_id and action (approve/reject/label/disable) required" }, { status: 400 });
  }
  if ((action === "approve" || action === "label") && !/sponsored|ad/i.test(displayLabel)) {
    return NextResponse.json({ error: "Sponsored placements must have a visible Sponsored/Ad label" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (action === "approve") {
    update.is_active = true;
    update.display_label = displayLabel;
  } else if (action === "reject" || action === "disable") {
    update.is_active = false;
  } else if (action === "label") {
    update.display_label = displayLabel;
  }

  const { data, error } = await sb.from("sponsored_placements").update(update).eq("id", placementId).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAuditEvent(sb, request, "admin.sponsored_placement.update", { placement_id: placementId, action });
  return NextResponse.json({ placement: data });
}
