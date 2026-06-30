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
  const reviewerNote = String(body.reviewer_note ?? (action === "label" ? "Labeled as business-submitted; not verified" : "")).trim() || null;

  if (!claimId || !["approve", "reject", "label", "disable"].includes(action)) {
    return NextResponse.json({ error: "claim_id and action (approve/reject/label/disable) required" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const update: Record<string, unknown> = { updated_at: now, reviewed_at: now, reviewer_note: reviewerNote, citation_ready: false };
  if (action === "approve") update.status = "accepted";
  if (action === "reject" || action === "disable") update.status = "rejected";

  const { data, error } = await sb.from("business_submitted_claims").update(update).eq("id", claimId).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAuditEvent(sb, request, "admin.business_submitted_claim.update", { claim_id: claimId, action });
  return NextResponse.json({ claim: data, warning: "Business-submitted claims remain separate from verified facts and citation_ready=false." });
}
