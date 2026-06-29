import { NextResponse } from "next/server";

import { logAdminAuditEvent, requireAdmin, supabaseAdmin } from "@/lib/admin-api";

const DEFAULT_STATUS = "needs_review";
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const HIGH_RISK_CATEGORIES = new Set(["finance", "banking", "insurance", "healthcare", "genomics", "dna", "government", "labor", "tax", "travel", "real_estate", "housing"]);

type ClaimWithDocument = {
  id: string;
  document_id: string;
  entity_id: string;
  field_path: string;
  claim_text: string;
  claim_value: string;
  jurisdiction?: string | null;
  confidence: string;
  status: string;
  last_verified_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  claim_sources?: unknown[];
  documents?: (DocumentForReview & { entities?: unknown }) | DocumentForReview[] | null;
};

type DocumentForReview = {
  id: string;
  entity_id: string;
  slug: string;
  lang: string;
  country: string;
  title: string;
  category: string;
  template: string;
  status: string;
  confidence: string;
  last_verified_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  entities?: unknown;
  claims?: ClaimWithDocument[];
};

function boundedInt(value: string | null, fallback: number, max?: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return typeof max === "number" ? Math.min(parsed, max) : parsed;
}

function firstDocument(row: ClaimWithDocument) {
  return Array.isArray(row.documents) ? row.documents[0] : row.documents;
}

function riskRank(category?: string | null) {
  return HIGH_RISK_CATEGORIES.has(String(category ?? "").toLowerCase()) ? 0 : 1;
}

function claimDate(row: ClaimWithDocument) {
  return new Date(row.created_at ?? row.updated_at ?? 0).getTime();
}

export async function GET(request: Request) {
  const adminError = requireAdmin(request, "claims.read_for_review");
  if (adminError) return adminError;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });

  const params = new URL(request.url).searchParams;
  const status = params.get("status")?.trim() || DEFAULT_STATUS;
  const country = params.get("country")?.trim();
  const lang = params.get("lang")?.trim();
  const category = params.get("category")?.trim();
  const slug = params.get("slug")?.trim();
  const sort = params.get("sort")?.trim() || "high_risk";
  const limit = boundedInt(params.get("limit"), DEFAULT_LIMIT, MAX_LIMIT);
  const offset = boundedInt(params.get("offset"), 0);

  let query = sb
    .from("claims")
    .select("*, claim_sources(*), documents!inner(*, entities(*))", { count: "exact" })
    .eq("status", status);

  if (country) query = query.eq("documents.country", country.toUpperCase());
  if (lang) query = query.eq("documents.lang", lang.toLowerCase());
  if (category) query = query.eq("documents.category", category);
  if (slug) query = query.ilike("documents.slug", `%${slug}%`);

  const { data, error, count } = await query.order("created_at", { ascending: true }).limit(1000);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const sortedClaims = [...((data ?? []) as ClaimWithDocument[])].sort((a, b) => {
    const docA = firstDocument(a);
    const docB = firstDocument(b);
    if (sort === "oldest") return claimDate(a) - claimDate(b);
    const riskDelta = riskRank(docA?.category) - riskRank(docB?.category);
    if (riskDelta !== 0) return riskDelta;
    return claimDate(a) - claimDate(b);
  });
  const pagedClaims = sortedClaims.slice(offset, offset + limit);
  const documentsById = new Map<string, DocumentForReview>();

  for (const claim of pagedClaims) {
    const document = firstDocument(claim);
    if (!document) continue;
    const existing = documentsById.get(document.id) ?? { ...document, claims: [] };
    const claimWithoutDocument = { ...claim };
    delete claimWithoutDocument.documents;
    existing.claims = [...(existing.claims ?? []), claimWithoutDocument];
    documentsById.set(document.id, existing);
  }

  await logAdminAuditEvent(sb, request, "admin.verify_claim.list", {
    result_count: pagedClaims.length,
    count: count ?? sortedClaims.length,
    limit,
    offset,
    status,
    country: country ?? null,
    lang: lang ?? null,
    category: category ?? null,
    slug: slug ?? null,
    sort,
  });
  return NextResponse.json({
    documents: Array.from(documentsById.values()),
    count: count ?? sortedClaims.length,
    limit,
    offset,
    has_more: offset + limit < (count ?? sortedClaims.length),
  });
}

export async function POST(request: Request) {
  const adminError = requireAdmin(request, "claims.verify");
  if (adminError) return adminError;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });

  const body = await request.json();
  const action = String(body.action ?? "verify").trim();
  const claimId = String(body.claim_id ?? "").trim();
  const claimIds = Array.isArray(body.claim_ids) ? body.claim_ids.map((id: unknown) => String(id).trim()).filter(Boolean) : [];
  const reason = String(body.reason ?? "").trim();

  if (action === "bulk_verify") {
    await logAdminAuditEvent(sb, request, "admin.verify_claim.bulk_verify_blocked", { requested_count: claimIds.length });
    return NextResponse.json({ error: "bulk verify is disabled; review each claim with a source manually" }, { status: 403 });
  }

  if (action === "needs_verification" || action === "reject" || action === "bulk_needs_verification") {
    const ids = action === "bulk_needs_verification" ? claimIds : [claimId].filter(Boolean);
    if (ids.length === 0) return NextResponse.json({ error: "claim_id or claim_ids are required" }, { status: 400 });
    if (!reason) return NextResponse.json({ error: "reason is required for rejected or needs-verification actions" }, { status: 400 });
    const newStatus = action === "reject" ? "disputed" : "needs_review";
    const { data: existingClaims, error: fetchError } = await sb
      .from("claims")
      .select("id, document_id, status, confidence")
      .in("id", ids);
    if (fetchError) return NextResponse.json({ error: "claims lookup failed", detail: fetchError.message }, { status: 500 });
    if ((existingClaims ?? []).length !== ids.length) return NextResponse.json({ error: "one or more claims were not found" }, { status: 404 });

    const now = new Date().toISOString();
    const { error: updateError } = await sb
      .from("claims")
      .update({ status: newStatus, confidence: "low", last_verified_at: null, updated_at: now })
      .in("id", ids);
    if (updateError) return NextResponse.json({ error: "claim status update failed", detail: updateError.message }, { status: 500 });

    const events = (existingClaims ?? []).map((claim) => ({
      claim_id: claim.id,
      event_type: "reviewed",
      previous_status: claim.status,
      new_status: newStatus,
      previous_confidence: claim.confidence,
      new_confidence: "low",
      note: reason,
    }));
    const { error: eventError } = await sb.from("verification_events").insert(events);
    if (eventError) return NextResponse.json({ error: "verification event insert failed", detail: eventError.message }, { status: 500 });

    await logAdminAuditEvent(sb, request, action === "bulk_needs_verification" ? "admin.verify_claim.bulk_needs_verification" : `admin.verify_claim.${action}`, {
      claim_ids: ids,
      count: ids.length,
      reason,
      new_status: newStatus,
    });
    return NextResponse.json({ updated_claim_ids: ids, status: newStatus });
  }

  if (action !== "verify") return NextResponse.json({ error: "invalid action" }, { status: 400 });

  const claimValue = String(body.claim_value ?? "").trim();
  const sourceType = String(body.source_type ?? "official").trim();
  const title = String(body.title ?? "").trim() || null;
  const url = String(body.url ?? "").trim() || null;
  const citation = String(body.citation ?? "").trim() || null;
  const observedAt = String(body.observed_at ?? new Date().toISOString()).trim();
  const confidence = String(body.confidence ?? "high").trim();
  const allowedSources = new Set(["official", "platform", "review", "user", "phone", "photo", "document", "web", "other", "unknown"]);
  const allowedConfidence = new Set(["medium", "high"]);

  if (!claimId || !claimValue || claimValue === "확인 필요") return NextResponse.json({ error: "claim_id and verified claim_value are required" }, { status: 400 });
  if (!title && !url && !citation) return NextResponse.json({ error: "at least one source title, url, or citation is required" }, { status: 400 });
  if (!allowedSources.has(sourceType) || !allowedConfidence.has(confidence)) return NextResponse.json({ error: "invalid source_type or confidence" }, { status: 400 });

  const { data: existingClaim, error: fetchError } = await sb
    .from("claims")
    .select("id, document_id, entity_id, status, confidence")
    .eq("id", claimId)
    .single();
  if (fetchError || !existingClaim) return NextResponse.json({ error: "claim not found", detail: fetchError?.message }, { status: 404 });

  const now = new Date().toISOString();
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

  const { error: eventError } = await sb.from("verification_events").insert({
    claim_id: claimId,
    event_type: "status_changed",
    previous_status: existingClaim.status,
    new_status: "verified",
    previous_confidence: existingClaim.confidence,
    new_confidence: confidence,
    note: citation ?? title ?? url,
  });
  if (eventError) {
    await sb.from("claims").update({ status: existingClaim.status, confidence: existingClaim.confidence, updated_at: now }).eq("id", claimId);
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
