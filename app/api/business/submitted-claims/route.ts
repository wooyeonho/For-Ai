import { NextResponse } from "next/server";
import { supabaseAdmin, requireAdmin, logAdminAuditEvent } from "@/lib/admin-api";

export async function GET(request: Request) {
  const adminError = await requireAdmin(request, "business_corrections.read");
  if (adminError) return adminError;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "pending_verification";
  const { data, error } = await sb
    .from("business_submitted_claims")
    .select("*, verified_business_profiles(business_name, tier)")
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ claims: data ?? [] });
}

export async function PATCH(request: Request) {
  const adminError = await requireAdmin(request, "business_corrections.review");
  if (adminError) return adminError;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  const body = await request.json();
  const claimId = String(body.claim_id ?? "").trim();
  const action = String(body.action ?? "").trim();
  const newStatus = String(body.status ?? "").trim();
  const reviewerNote = body.reviewer_note ? String(body.reviewer_note).trim() : null;
  if (!claimId) return NextResponse.json({ error: "claim_id required" }, { status: 400 });
  const now = new Date().toISOString();
  const update: Record<string, unknown> = { updated_at: now, reviewer_note: reviewerNote };
  if (action === "request_source") {
    update.status = "pending_verification";
  } else if (["accepted", "rejected"].includes(newStatus)) {
    update.status = newStatus;
    update.reviewed_at = now;
  } else {
    return NextResponse.json({ error: "valid status (accepted/rejected) or action=request_source required" }, { status: 400 });
  }
  const { data, error } = await sb.from("business_submitted_claims").update(update).eq("id", claimId).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAdminAuditEvent(sb, request, "admin.business_submitted_claim.review", { claim_id: claimId, new_status: String(update.status), entity_id: data.entity_id });
  return NextResponse.json({ claim: data });
}
