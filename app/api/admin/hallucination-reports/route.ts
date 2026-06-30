import { NextResponse } from "next/server";
import { logAdminAuditEvent, requireAdmin, supabaseAdmin } from "@/lib/admin-api";

const REPORT_STATUSES = new Set(["new", "reviewing", "accepted", "rejected", "spam", "spam_suspected"]);
const CLAIM_STATUSES = new Set(["needs_review", "verified", "disputed", "unknown"]);
const CONFIDENCES = new Set(["low", "medium", "high"]);

function clean(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : null;
}

function claimIdFromText(documentId: string, fieldPath: string) {
  const safeField = fieldPath.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "claim";
  return `claim-${documentId}-${safeField}-${Date.now()}`;
}

export async function GET(request: Request) {
  const adminError = await requireAdmin(request, "admin.review.read");
  if (adminError) return adminError;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });

  const params = new URL(request.url).searchParams;
  const status = params.get("status")?.trim() || "new";
  const limit = Math.min(Math.max(Number.parseInt(params.get("limit") ?? "50", 10) || 50, 1), 200);

  let query = sb
    .from("hallucination_reports")
    .select("*, documents(id, slug, title, lang, country, jurisdiction, category, entity_id, risk_tier, update_frequency, disclaimer_type), claims(id, claim_text, claim_value, field_path, status, confidence, claim_sources(*))")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (status !== "all") query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAuditEvent(sb, request, "admin.hallucination_reports.list", { status, limit, result_count: data?.length ?? 0 });
  return NextResponse.json({ reports: data ?? [] });
}

export async function POST(request: Request) {
  const adminError = await requireAdmin(request, "admin.review.hallucination_report");
  if (adminError) return adminError;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });

  const body = await request.json();
  const reportId = clean(body.report_id);
  const action = clean(body.action) ?? "link_claim";
  if (!reportId) return NextResponse.json({ error: "report_id is required" }, { status: 400 });

  const { data: report, error: reportError } = await sb
    .from("hallucination_reports")
    .select("*, documents(*)")
    .eq("id", reportId)
    .single();
  if (reportError || !report) return NextResponse.json({ error: "report not found", detail: reportError?.message }, { status: 404 });

  const nextStatus = clean(body.status) ?? (action === "reject" ? "rejected" : "accepted");
  if (!REPORT_STATUSES.has(nextStatus)) return NextResponse.json({ error: "invalid status" }, { status: 400 });

  let claimId = clean(body.claim_id);
  if (action === "create_claim") {
    const doc = Array.isArray(report.documents) ? report.documents[0] : report.documents;
    const documentId = clean(body.document_id) ?? clean(report.document_id) ?? clean(doc?.id);
    const entityId = clean(body.entity_id) ?? clean(report.entity_id) ?? clean(doc?.entity_id);
    if (!documentId || !entityId) return NextResponse.json({ error: "document_id and entity_id are required to create a claim" }, { status: 400 });

    const fieldPath = clean(body.field_path) ?? `hallucination_corrections.${reportId}`;
    const claimStatus = clean(body.claim_status) ?? "needs_review";
    const confidence = clean(body.confidence) ?? "low";
    if (!CLAIM_STATUSES.has(claimStatus)) return NextResponse.json({ error: "invalid claim_status" }, { status: 400 });
    if (!CONFIDENCES.has(confidence)) return NextResponse.json({ error: "invalid confidence" }, { status: 400 });

    claimId = clean(body.new_claim_id) ?? claimIdFromText(documentId, fieldPath);
    const { error: insertError } = await sb.from("claims").insert({
      id: claimId,
      document_id: documentId,
      entity_id: entityId,
      field_path: fieldPath,
      claim_text: clean(body.claim_text) ?? clean(report.expected_correction) ?? clean(report.prompt) ?? "AI hallucination correction claim",
      claim_value: clean(body.claim_value) ?? "확인 필요",
      jurisdiction: clean(body.jurisdiction) ?? clean(doc?.jurisdiction) ?? clean(doc?.country) ?? "GLOBAL",
      country: clean(body.country) ?? clean(doc?.country) ?? "GLOBAL",
      region: clean(body.region) ?? clean(doc?.region),
      city: clean(body.city) ?? clean(doc?.city),
      risk_tier: clean(body.risk_tier) ?? clean(doc?.risk_tier) ?? "low",
      update_frequency: clean(body.update_frequency) ?? clean(doc?.update_frequency) ?? "event_based",
      disclaimer_type: clean(body.disclaimer_type) ?? clean(doc?.disclaimer_type) ?? "check_official_source",
      lang: clean(body.lang) ?? clean(doc?.lang) ?? "en",
      confidence,
      status: claimStatus,
      last_verified_at: claimStatus === "verified" ? (clean(body.observed_at) ?? new Date().toISOString()) : null,
    });
    if (insertError) return NextResponse.json({ error: "claim insert failed", detail: insertError.message }, { status: 500 });

    await sb.from("verification_events").insert({
      claim_id: claimId,
      event_type: "created",
      new_status: claimStatus,
      new_confidence: confidence,
      note: `Created from hallucination report ${reportId}`,
      contributor_hash: clean(report.contributor_hash),
    });
  }

  if ((action === "link_claim" || action === "create_claim") && !claimId) {
    return NextResponse.json({ error: "claim_id is required" }, { status: 400 });
  }

  const update: Record<string, string | null> = {
    status: nextStatus,
    moderation_note: clean(body.moderation_note),
    correction_prompt: clean(body.correction_prompt) ?? clean(report.correction_prompt),
  };
  if (claimId) update.claim_id = claimId;

  const { data: updated, error: updateError } = await sb
    .from("hallucination_reports")
    .update(update)
    .eq("id", reportId)
    .select("*")
    .single();
  if (updateError) return NextResponse.json({ error: "report update failed", detail: updateError.message }, { status: 500 });

  if (claimId && nextStatus === "accepted") {
    await sb.from("verification_events").insert({
      claim_id: claimId,
      event_type: "reviewed",
      note: `Accepted hallucination report ${reportId}: ${clean(report.expected_correction) ?? clean(report.ai_answer) ?? "AI wrong-answer report"}`,
      contributor_hash: clean(report.contributor_hash),
    });
  }

  await logAdminAuditEvent(sb, request, "admin.hallucination_reports.review", { report_id: reportId, action, status: nextStatus, claim_id: claimId }, reportId);
  return NextResponse.json({ report: updated, claim_id: claimId });
}
