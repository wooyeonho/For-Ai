import { NextResponse } from "next/server";

import { logAdminAuditEvent, requireAdmin, supabaseAdmin } from "@/lib/admin-api";
import { awardPoints, POINT_VALUES } from "@/lib/gamification";

type InboxAction = "link_claim" | "create_claim" | "reject";

function clean(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : null;
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "").slice(0, 48) || "claim";
}

export async function GET(request: Request) {
  const adminError = await requireAdmin(request, "hallucination_reports.read");
  if (adminError) return adminError;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });

  const params = new URL(request.url).searchParams;
  const status = params.get("status")?.trim() || "new";
  const limit = Math.min(Math.max(Number.parseInt(params.get("limit") ?? "50", 10) || 50, 1), 200);

  let query = sb
    .from("hallucination_reports")
    .select("*, documents(id, slug, title, lang, country, category), claims(id, claim_text, claim_value, status, confidence, last_verified_at, claim_sources(*))")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status !== "all") query = query.eq("status", status);

  const { data: reports, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const documentIds = [...new Set((reports ?? []).map((report) => report.document_id).filter(Boolean))];
  const { data: documentClaims, error: claimsError } = documentIds.length > 0
    ? await sb
      .from("claims")
      .select("id, document_id, field_path, claim_text, claim_value, status, confidence, last_verified_at, claim_sources(*)")
      .in("document_id", documentIds)
      .order("updated_at", { ascending: false })
    : { data: [], error: null };
  if (claimsError) return NextResponse.json({ error: claimsError.message }, { status: 500 });

  await logAdminAuditEvent(sb, request, "admin.hallucination_inbox.list", { status, limit, result_count: reports?.length ?? 0 });
  return NextResponse.json({ reports: reports ?? [], claims: documentClaims ?? [] });
}

export async function POST(request: Request) {
  const adminError = await requireAdmin(request, "hallucination_reports.review");
  if (adminError) return adminError;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });

  const body = await request.json();
  const action = clean(body.action) as InboxAction | null;
  const reportId = clean(body.report_id);
  const moderationNote = clean(body.moderation_note);
  if (!reportId) return NextResponse.json({ error: "report_id is required" }, { status: 400 });
  if (!action || !["link_claim", "create_claim", "reject"].includes(action)) return NextResponse.json({ error: "invalid action" }, { status: 400 });

  const { data: report, error: reportError } = await sb
    .from("hallucination_reports")
    .select("*, documents(id, entity_id, slug, lang, country, jurisdiction, category, risk_tier, disclaimer_type)")
    .eq("id", reportId)
    .single();
  if (reportError || !report) return NextResponse.json({ error: "report not found", detail: reportError?.message }, { status: 404 });

  if (action === "reject") {
    const { error } = await sb.from("hallucination_reports").update({ status: "rejected", moderation_note: moderationNote }).eq("id", reportId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await logAdminAuditEvent(sb, request, "admin.hallucination_inbox.reject", { report_id: reportId }, reportId);
    return NextResponse.json({ report_id: reportId, status: "rejected" });
  }

  let claimId = clean(body.claim_id);
  if (action === "link_claim" && !claimId) return NextResponse.json({ error: "claim_id is required" }, { status: 400 });

  if (action === "create_claim") {
    const document = Array.isArray(report.documents) ? report.documents[0] : report.documents;
    if (!document?.id || !document?.entity_id) return NextResponse.json({ error: "report must be attached to a document/entity before claim creation" }, { status: 400 });
    const claimText = clean(body.claim_text) ?? clean(report.expected_correction) ?? `Reported AI error needs verification for ${document.slug}`;
    const claimValue = clean(body.claim_value) ?? "확인 필요";
    const fieldPath = clean(body.field_path) ?? `hallucination.${slugify(claimText)}`;
    claimId = `claim-${document.id}-${slugify(fieldPath)}-${Date.now()}`;

    const { error: insertError } = await sb.from("claims").insert({
      id: claimId,
      document_id: document.id,
      entity_id: document.entity_id,
      field_path: fieldPath,
      claim_text: claimText,
      claim_value: claimValue,
      jurisdiction: clean(document.jurisdiction) ?? "GLOBAL",
      country: clean(document.country) ?? "GLOBAL",
      risk_tier: clean(document.risk_tier) ?? "low",
      disclaimer_type: clean(document.disclaimer_type) ?? "check_official_source",
      lang: clean(document.lang) ?? "en",
      confidence: "low",
      status: "needs_review",
    });
    if (insertError) return NextResponse.json({ error: "claim creation failed", detail: insertError.message }, { status: 500 });

    await sb.from("verification_events").insert({
      claim_id: claimId,
      event_type: "reviewed",
      previous_status: null,
      new_status: "needs_review",
      previous_confidence: null,
      new_confidence: "low",
      note: moderationNote ?? `Created from hallucination report ${reportId}; source-backed verification still required.`,
      contributor_hash: report.contributor_hash ?? null,
    });
  }

  const correctionPrompt = clean(body.correction_prompt) ?? clean(report.correction_prompt) ?? clean(report.expected_correction);
  const { error: updateError } = await sb.from("hallucination_reports").update({
    status: "accepted",
    claim_id: claimId,
    moderation_note: moderationNote,
    correction_prompt: correctionPrompt,
  }).eq("id", reportId);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  if (report.contributor_hash) {
    await awardPoints(sb, report.contributor_hash, "hallucination_report_accepted", POINT_VALUES.hallucination_accepted, {
      referenceId: reportId,
      referenceType: "hallucination_report",
      metadata: { claim_id: claimId },
    });
  }

  await logAdminAuditEvent(sb, request, `admin.hallucination_inbox.${action}`, { report_id: reportId, claim_id: claimId }, reportId);
  return NextResponse.json({ report_id: reportId, claim_id: claimId, status: "accepted" });
}
