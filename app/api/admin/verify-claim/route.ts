import { NextResponse } from "next/server";

import { logAdminAuditEvent, requireAdmin, supabaseAdmin } from "@/lib/admin-api";
import { assertVerifiedClaimReady, UNKNOWN_FACT_TEXT } from "@/lib/citation-status";
import type { Confidence, SourceType } from "@/lib/types";

export async function GET(request: Request) {
  const adminError = requireAdmin(request, "claims.read_for_review");
  if (adminError) return adminError;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });

  const { data, error } = await sb
    .from("documents")
    .select("*, entities(*), claims(*, claim_sources(*))")
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAdminAuditEvent(sb, request, "admin.verify_claim.list", {
    result_count: data?.length ?? 0,
  });
  return NextResponse.json({ documents: data ?? [] });
}

export async function POST(request: Request) {
  const adminError = requireAdmin(request, "claims.verify");
  if (adminError) return adminError;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });

  const body = await request.json();
  const claimId = String(body.claim_id ?? "").trim();
  const claimValue = String(body.claim_value ?? "").trim();
  const sourceType = String(body.source_type ?? "official").trim();
  const title = String(body.title ?? "").trim() || null;
  const url = String(body.url ?? "").trim() || null;
  const citation = String(body.citation ?? "").trim() || null;
  const observedAt = String(body.observed_at ?? new Date().toISOString()).trim();
  const confidence = String(body.confidence ?? "high").trim();
  const allowedSources = new Set<SourceType>(["official", "law", "regulator", "platform", "review", "user", "phone", "photo", "document", "web", "other", "unknown"]);
  const allowedConfidence = new Set<Confidence>(["medium", "high"]);

  if (!claimId || !claimValue || claimValue === UNKNOWN_FACT_TEXT) return NextResponse.json({ error: "claim_id and verified claim_value are required" }, { status: 400 });
  if (!observedAt || Number.isNaN(Date.parse(observedAt))) return NextResponse.json({ error: "valid observed_at / last_verified_at is required" }, { status: 400 });
  if (!title && !url && !citation) return NextResponse.json({ error: "at least one source title, url, or citation is required" }, { status: 400 });
  if (!allowedSources.has(sourceType as SourceType) || !allowedConfidence.has(confidence as Confidence)) return NextResponse.json({ error: "invalid source_type or confidence" }, { status: 400 });

  const { data: existingClaim, error: fetchError } = await sb
    .from("claims")
    .select("id, document_id, entity_id, status, confidence, claim_value, last_verified_at")
    .eq("id", claimId)
    .single();
  if (fetchError || !existingClaim) return NextResponse.json({ error: "claim not found", detail: fetchError?.message }, { status: 404 });

  const now = new Date().toISOString();
  const eventDraft = {
    claim_id: claimId,
    event_type: "status_changed" as const,
    previous_status: existingClaim.status,
    new_status: "verified" as const,
    previous_confidence: existingClaim.confidence,
    new_confidence: confidence as "medium" | "high",
    note: citation ?? title ?? url,
  };
  const readiness = assertVerifiedClaimReady({
    claim_value: claimValue,
    confidence: confidence as "medium" | "high",
    status: "verified",
    last_verified_at: observedAt,
    sources: [{
      id: "pending-source",
      claim_id: claimId,
      source_type: sourceType as SourceType,
      title,
      url,
      citation,
      observed_at: observedAt,
      contributor_hash: null,
      created_at: null,
    }],
    verification_events: [{
      id: "pending-event",
      contributor_hash: null,
      created_at: now,
      ...eventDraft,
    }],
  });
  if (!readiness.ok) {
    return NextResponse.json({ error: "verified claim requirements not met", violations: readiness.violations }, { status: 422 });
  }

  const sourceId = `src-${claimId}-${Date.now()}`;
  const { error: sourceError } = await sb.from("claim_sources").insert({
    id: sourceId,
    claim_id: claimId,
    source_type: sourceType,
    title,
    url,
    citation,
    observed_at: observedAt,
  });
  if (sourceError) return NextResponse.json({ error: "source insert failed", detail: sourceError.message }, { status: 500 });

  const { data: updatedClaim, error: claimError } = await sb
    .from("claims")
    .update({ claim_value: claimValue, confidence, status: "verified", last_verified_at: observedAt, updated_at: now })
    .eq("id", claimId)
    .select("*")
    .single();
  if (claimError) {
    await sb.from("claim_sources").delete().eq("id", sourceId);
    return NextResponse.json({ error: "claim update failed", detail: claimError.message }, { status: 500 });
  }

  const { error: eventError } = await sb.from("verification_events").insert(eventDraft);
  if (eventError) {
    await sb.from("claims").update({
      claim_value: existingClaim.claim_value,
      confidence: existingClaim.confidence,
      status: existingClaim.status,
      last_verified_at: existingClaim.last_verified_at,
      updated_at: now,
    }).eq("id", claimId);
    await sb.from("claim_sources").delete().eq("id", sourceId);
    return NextResponse.json({ error: "verification event insert failed", detail: eventError.message }, { status: 500 });
  }

  const { data: siblingClaims } = await sb.from("claims").select("status").eq("document_id", existingClaim.document_id);
  const allVerified = (siblingClaims ?? []).length > 0 && (siblingClaims ?? []).every((claim) => claim.status === "verified");
  await sb.from("documents").update({
    status: allVerified ? "verified" : "published",
    confidence: allVerified ? "high" : "low",
    last_verified_at: allVerified ? observedAt : null,
    updated_at: now,
  }).eq("id", existingClaim.document_id);
  await logAdminAuditEvent(sb, request, "admin.verify_claim.update", {
    claim_id: claimId,
    document_id: existingClaim.document_id,
    source_type: sourceType,
    confidence,
    document_all_verified: allVerified,
  });

  return NextResponse.json({ claim: updatedClaim, source_id: sourceId, document_all_verified: allVerified });
}
