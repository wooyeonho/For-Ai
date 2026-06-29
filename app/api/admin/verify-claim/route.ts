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

type ClaimAction = "verify" | "reject" | "mark_unknown" | "edit_value" | "attach_source" | "promote_document";

type SourceInput = {
  source_type?: string;
  title?: string;
  url?: string;
  citation?: string;
  observed_at?: string;
};

const ALLOWED_SOURCES = new Set(["official", "platform", "review", "user", "phone", "photo", "document", "web", "other", "unknown"]);
const ALLOWED_CONFIDENCE = new Set(["low", "medium", "high"]);
const SOURCE_TRUST: Record<string, number> = {
  official: 95,
  platform: 85,
  document: 80,
  web: 65,
  photo: 60,
  phone: 55,
  review: 40,
  user: 30,
  other: 25,
  unknown: 0,
};

function clean(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : null;
}

function sourceTrustScore(sourceType: string, hasUrl: boolean, hasCitation: boolean): number {
  const base = SOURCE_TRUST[sourceType] ?? SOURCE_TRUST.unknown;
  return Math.min(100, base + (hasUrl ? 3 : 0) + (hasCitation ? 2 : 0));
}

function providerFromModel(model: unknown): string | null {
  const text = typeof model === "string" ? model.trim() : "";
  if (!text) return null;
  return text.includes("/") ? text.split("/")[0] : text;
}

async function writeVerificationEvent(
  sb: NonNullable<ReturnType<typeof supabaseAdmin>>,
  claim: { id: string; status: string; confidence: string },
  eventType: "reviewed" | "source_added" | "status_changed" | "confidence_changed",
  next: { status?: string; confidence?: string; note?: string | null; contributor_hash?: string | null },
) {
  const { error } = await sb.from("verification_events").insert({
    claim_id: claim.id,
    event_type: eventType,
    previous_status: claim.status,
    new_status: next.status ?? claim.status,
    previous_confidence: claim.confidence,
    new_confidence: next.confidence ?? claim.confidence,
    note: next.note ?? null,
    contributor_hash: next.contributor_hash ?? null,
  });
  if (error) throw new Error(`verification event insert failed: ${error.message}`);
}

async function maybePromoteDocument(sb: NonNullable<ReturnType<typeof supabaseAdmin>>, documentId: string, observedAt: string) {
  const { data: siblingClaims, error } = await sb.from("claims").select("status").eq("document_id", documentId);
  if (error) throw new Error(`sibling claims query failed: ${error.message}`);
  const allVerified = (siblingClaims ?? []).length > 0 && (siblingClaims ?? []).every((claim) => claim.status === "verified");
  const now = new Date().toISOString();
  const { error: docError } = await sb.from("documents").update({
    status: allVerified ? "verified" : "published",
    confidence: allVerified ? "high" : "low",
    last_verified_at: allVerified ? observedAt : null,
    updated_at: now,
  }).eq("id", documentId);
  if (docError) throw new Error(`document update failed: ${docError.message}`);
  return allVerified;
}

export async function GET(request: Request) {
  const adminError = await requireAdmin(request, "claims.read_for_review");
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
    const docData = ((document as unknown as { data?: Record<string, unknown> }).data ?? {}) as Record<string, unknown>;
    const generationModel = clean(docData.generation_model) ?? clean(docData.ai_model);
    const sourceHints = Array.isArray(docData.source_hints) ? docData.source_hints : [];
    const existing = documentsById.get(document.id) ?? {
      ...document,
      source_hints: sourceHints,
      ai_provider: clean(docData.ai_provider) ?? providerFromModel(generationModel),
      ai_model: generationModel,
      claims: [],
    };
    const claimWithoutDocument = { ...claim } as Partial<ClaimWithDocument>;
    delete claimWithoutDocument.documents;
    existing.claims = [...(existing.claims ?? []), { ...claimWithoutDocument, source_candidates: sourceHints } as ClaimWithDocument];
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
  const adminError = await requireAdmin(request, "claims.review_action");
  if (adminError) return adminError;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });

  const body = await request.json();
  const action = String(body.action ?? "verify").trim() as ClaimAction;
  const claimId = String(body.claim_id ?? "").trim();
  const claimIds = Array.isArray(body.claim_ids) ? body.claim_ids.map((id: unknown) => String(id).trim()).filter(Boolean) : [];

  if (action === "bulk_verify") {
    await logAdminAuditEvent(sb, request, "admin.verify_claim.bulk_verify_blocked", { requested_count: claimIds.length });
    return NextResponse.json({ error: "bulk verify is disabled; review each claim with a source manually" }, { status: 403 });
  }

  if (action === ("bulk_needs_verification" as ClaimAction)) {
    const reason = String(body.reason ?? "").trim();
    if (claimIds.length === 0) return NextResponse.json({ error: "claim_ids are required" }, { status: 400 });
    if (!reason) return NextResponse.json({ error: "reason is required for needs-verification actions" }, { status: 400 });
    const { data: existingClaims, error: fetchError } = await sb
      .from("claims")
      .select("id, document_id, status, confidence")
      .in("id", claimIds);
    if (fetchError) return NextResponse.json({ error: "claims lookup failed", detail: fetchError.message }, { status: 500 });
    if ((existingClaims ?? []).length !== claimIds.length) return NextResponse.json({ error: "one or more claims were not found" }, { status: 404 });

    const now = new Date().toISOString();
    const { error: updateError } = await sb
      .from("claims")
      .update({ status: "needs_review", confidence: "low", last_verified_at: null, updated_at: now })
      .in("id", claimIds);
    if (updateError) return NextResponse.json({ error: "claim status update failed", detail: updateError.message }, { status: 500 });

    const events = (existingClaims ?? []).map((claim) => ({
      claim_id: claim.id,
      event_type: "reviewed",
      previous_status: claim.status,
      new_status: "needs_review",
      previous_confidence: claim.confidence,
      new_confidence: "low",
      note: reason,
    }));
    const { error: eventError } = await sb.from("verification_events").insert(events);
    if (eventError) return NextResponse.json({ error: "verification event insert failed", detail: eventError.message }, { status: 500 });

    await logAdminAuditEvent(sb, request, "admin.verify_claim.bulk_needs_verification", {
      claim_ids: claimIds,
      count: claimIds.length,
      reason,
      new_status: "needs_review",
    });
    return NextResponse.json({ updated_claim_ids: claimIds, status: "needs_review" });
  }

  const claimValue = clean(body.claim_value);
  const confidence = clean(body.confidence) ?? (action === "mark_unknown" || action === "reject" ? "low" : "high");
  const observedAt = clean(body.observed_at) ?? new Date().toISOString();
  const note = clean(body.note) ?? clean(body.citation) ?? clean(body.reason);
  const contributorHash = clean(body.contributor_hash);
  const source = (body.source ?? body) as SourceInput;
  const sourceType = clean(source.source_type) ?? "official";
  const title = clean(source.title);
  const url = clean(source.url);
  const citation = clean(source.citation) ?? clean(body.citation);
  const shouldAttachSource = ["verify", "attach_source"].includes(action) || Boolean(title || url || citation);

  if (!claimId) return NextResponse.json({ error: "claim_id is required" }, { status: 400 });
  if (!["verify", "reject", "mark_unknown", "edit_value", "attach_source", "promote_document"].includes(action)) return NextResponse.json({ error: "invalid action" }, { status: 400 });
  if (!ALLOWED_CONFIDENCE.has(confidence)) return NextResponse.json({ error: "invalid confidence" }, { status: 400 });
  if (shouldAttachSource && (!ALLOWED_SOURCES.has(sourceType) || (!title && !url && !citation))) return NextResponse.json({ error: "valid source_type and at least one source title, url, or citation are required" }, { status: 400 });
  if (["verify", "edit_value"].includes(action) && (!claimValue || claimValue === "확인 필요")) return NextResponse.json({ error: "verified/edited claim_value is required" }, { status: 400 });

  const { data: existingClaim, error: fetchError } = await sb
    .from("claims")
    .select("id, document_id, entity_id, status, confidence, claim_value")
    .eq("id", claimId)
    .single();
  if (fetchError || !existingClaim) return NextResponse.json({ error: "claim not found", detail: fetchError?.message }, { status: 404 });

  const now = new Date().toISOString();
  let sourceId: string | null = null;
  try {
    if (shouldAttachSource) {
      sourceId = `src-${claimId}-${Date.now()}`;
      const { error: sourceError } = await sb.from("claim_sources").insert({ id: sourceId, claim_id: claimId, source_type: sourceType, title, url, citation, observed_at: observedAt, contributor_hash: contributorHash });
      if (sourceError) throw new Error(`source insert failed: ${sourceError.message}`);
      await writeVerificationEvent(sb, existingClaim, "source_added", { note: citation ?? title ?? url, contributor_hash: contributorHash });
    }

    const update: Record<string, string | null> = { updated_at: now };
    let nextStatus = existingClaim.status;
    let nextConfidence = existingClaim.confidence;
    if (action === "verify") {
      Object.assign(update, { claim_value: claimValue, confidence, status: "verified", last_verified_at: observedAt });
      nextStatus = "verified";
      nextConfidence = confidence;
    }
    if (action === "reject") {
      Object.assign(update, { status: "disputed", confidence: "low" });
      nextStatus = "disputed";
      nextConfidence = "low";
    }
    if (action === "mark_unknown") {
      Object.assign(update, { claim_value: "확인 필요", status: "unknown", confidence: "low", last_verified_at: null });
      nextStatus = "unknown";
      nextConfidence = "low";
    }
    if (action === "edit_value") {
      Object.assign(update, { claim_value: claimValue, confidence });
      nextConfidence = confidence;
    }

    let updatedClaim = existingClaim;
    if (Object.keys(update).length > 1) {
      const { data, error: claimError } = await sb.from("claims").update(update).eq("id", claimId).select("*").single();
      if (claimError) throw new Error(`claim update failed: ${claimError.message}`);
      updatedClaim = data;
      await writeVerificationEvent(sb, existingClaim, action === "edit_value" ? "reviewed" : "status_changed", { status: nextStatus, confidence: nextConfidence, note, contributor_hash: contributorHash });
    }

    const documentAllVerified = action === "promote_document" || action === "verify"
      ? await maybePromoteDocument(sb, existingClaim.document_id, observedAt)
      : false;
    if (action === "promote_document") {
      await writeVerificationEvent(sb, existingClaim, "reviewed", {
        status: existingClaim.status,
        confidence: existingClaim.confidence,
        note: documentAllVerified ? "document promoted to verified" : "document promotion skipped: not all claims verified",
        contributor_hash: contributorHash,
      });
    }

    await logAdminAuditEvent(sb, request, `admin.verify_claim.${action}`, {
      claim_id: claimId,
      document_id: existingClaim.document_id,
      entity_id: existingClaim.entity_id,
      source_id: sourceId,
      source_type: shouldAttachSource ? sourceType : null,
      source_trust_score: shouldAttachSource ? sourceTrustScore(sourceType, Boolean(url), Boolean(citation)) : null,
      previous_status: existingClaim.status,
      new_status: nextStatus,
      previous_confidence: existingClaim.confidence,
      new_confidence: nextConfidence,
      document_all_verified: documentAllVerified,
    });

    return NextResponse.json({ claim: updatedClaim, source_id: sourceId, source_trust_score: sourceId ? sourceTrustScore(sourceType, Boolean(url), Boolean(citation)) : null, document_all_verified: documentAllVerified });
  } catch (error) {
    if (sourceId) await sb.from("claim_sources").delete().eq("id", sourceId);
    const message = error instanceof Error ? error.message : "claim action failed";
    await logAdminAuditEvent(sb, request, `admin.verify_claim.${action}_failed`, { claim_id: claimId, error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
