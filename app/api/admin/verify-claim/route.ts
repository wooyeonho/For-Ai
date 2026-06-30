import { NextResponse } from "next/server";

import { logAdminAuditEvent, requireAdmin, supabaseAdmin } from "@/lib/admin-api";
import { recordContributionEvent } from "@/lib/contributions";
import { scoreSourceTrust } from "@/lib/source-trust";
import { awardPoints, checkAndAwardBadges, POINT_VALUES } from "@/lib/gamification";

const DEFAULT_STATUS = "needs_review";
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const HIGH_RISK_CATEGORIES = new Set(["finance", "banking", "insurance", "healthcare", "genomics", "dna", "government", "labor", "tax", "travel", "real_estate", "housing"]);
const ADMIN_ACCEPTED_SOURCE_POINTS = 10;
const VERIFIED_CLAIM_LINK_POINTS = 50;

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

function clean(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : null;
}


function providerFromModel(model: unknown): string | null {
  const text = typeof model === "string" ? model.trim() : "";
  if (!text) return null;
  return text.includes("/") ? text.split("/")[0] : text;
}


async function awardContributionPoints(
  sb: NonNullable<ReturnType<typeof supabaseAdmin>>,
  input: {
    contributor_hash: string | null;
    source_candidate_id?: string | null;
    claim_id: string;
    event_type: "source_admin_accepted" | "source_linked_verified_claim";
    points: number;
    reason: string;
  },
) {
  if (!input.contributor_hash || input.points <= 0) return;
  const now = new Date().toISOString();
  const { data: contributor, error: contributorError } = await sb
    .from("contributors")
    .upsert({ contributor_hash: input.contributor_hash, updated_at: now }, { onConflict: "contributor_hash" })
    .select("id,total_points,accepted_source_count,verified_claim_link_count")
    .single();
  if (contributorError) throw new Error(`contributor upsert failed: ${contributorError.message}`);

  const { data: event, error: eventError } = await sb.from("contribution_events").insert({
    contributor_id: contributor.id,
    contributor_hash: input.contributor_hash,
    source_candidate_id: input.source_candidate_id ?? null,
    claim_id: input.claim_id,
    event_type: input.event_type,
    points_delta: input.points,
    metadata: { points_do_not_determine_truth: true, reason: input.reason },
  }).select("id").single();
  if (eventError) throw new Error(`contribution event insert failed: ${eventError.message}`);

  const { error: pointsError } = await sb.from("contributor_points").insert({
    contributor_id: contributor.id,
    contributor_hash: input.contributor_hash,
    contribution_event_id: event.id,
    points: input.points,
    reason: input.event_type,
  });
  if (pointsError) throw new Error(`contributor points insert failed: ${pointsError.message}`);

  const update: Record<string, number | string> = {
    total_points: Number(contributor.total_points ?? 0) + input.points,
    updated_at: now,
  };
  if (input.event_type === "source_admin_accepted") {
    update.accepted_source_count = Number(contributor.accepted_source_count ?? 0) + 1;
  }
  if (input.event_type === "source_linked_verified_claim") {
    update.verified_claim_link_count = Number(contributor.verified_claim_link_count ?? 0) + 1;
  }
  await sb.from("contributors").update(update).eq("id", contributor.id);
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

  // HEAD params: rich filter state
  const status = params.get("status")?.trim() || DEFAULT_STATUS;
  const country = params.get("country")?.trim();
  const lang = params.get("lang")?.trim();
  const category = params.get("category")?.trim();
  const slug = params.get("slug")?.trim();
  const sort = params.get("sort")?.trim() || "high_risk";
  const limit = boundedInt(params.get("limit"), DEFAULT_LIMIT, MAX_LIMIT);

  // PR params: search, claim_status, doc_status, page
  const search = params.get("search")?.trim() ?? "";
  const claimStatus = params.get("claim_status") ?? "all"; // "needs_review" | "verified" | "all"
  const docStatus = params.get("doc_status") ?? "all";     // "published" | "verified" | "all"
  const page = Math.max(1, parseInt(params.get("page") ?? "1", 10));
  const offset = boundedInt(params.get("offset"), (page - 1) * limit);

  // Build query over documents (PR approach, with HEAD's rich filters applied)
  let docQuery = sb
    .from("documents")
    .select("*, entities(*), claims(*, claim_sources(*), verification_events(*))", { count: "exact" });

  // Apply status filter: prefer claim_status/doc_status (PR) when set, else use HEAD's status on claims
  if (docStatus !== "all") docQuery = docQuery.eq("status", docStatus);
  if (search) docQuery = docQuery.or(`title.ilike.%${search}%,slug.ilike.%${search}%`);
  if (country) docQuery = docQuery.eq("country", country.toUpperCase());
  if (lang) docQuery = docQuery.eq("lang", lang.toLowerCase());
  if (category) docQuery = docQuery.eq("category", category);
  if (slug) docQuery = docQuery.ilike("slug", `%${slug}%`);

  docQuery = docQuery.order("updated_at", { ascending: false }).range(offset, offset + limit - 1);

  const { data: rawData, error, count } = await docQuery;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Enrich documents with AI provider info (HEAD's approach)
  let documents = (rawData ?? []).map((doc) => {
    const docData = ((doc as unknown as { data?: Record<string, unknown> }).data ?? {}) as Record<string, unknown>;
    const generationModel = clean(docData.generation_model) ?? clean(docData.ai_model);
    const sourceHints = Array.isArray(docData.source_hints) ? docData.source_hints : [];
    return {
      ...doc,
      source_hints: sourceHints,
      ai_provider: clean(docData.ai_provider) ?? providerFromModel(generationModel),
      ai_model: generationModel,
    };
  });

  // Apply claim_status filter (PR approach): filter claims inside each document
  if (claimStatus !== "all") {
    documents = documents.map((doc) => ({
      ...doc,
      claims: ((doc.claims ?? []) as ClaimWithDocument[]).filter((c) => c.status === claimStatus),
    })).filter((doc) => (doc.claims ?? []).length > 0);
  }

  // Apply HEAD's status filter on claims when claim_status is "all" but status param is set
  if (claimStatus === "all" && status !== "all") {
    documents = documents.map((doc) => ({
      ...doc,
      claims: ((doc.claims ?? []) as ClaimWithDocument[]).filter((c) => c.status === status),
    })).filter((doc) => (doc.claims ?? []).length > 0);
  }

  // Sort documents so high-risk categories come first (HEAD's approach)
  if (sort === "high_risk") {
    documents = documents.sort((a, b) => {
      const riskDelta = riskRank(a.category) - riskRank(b.category);
      if (riskDelta !== 0) return riskDelta;
      return new Date(a.updated_at ?? 0).getTime() - new Date(b.updated_at ?? 0).getTime();
    });
  }

  // Aggregate claim stats (PR approach)
  const allClaims = (rawData ?? []).flatMap((doc) => (doc.claims ?? []) as ClaimWithDocument[]);
  const claimStats = {
    total: allClaims.length,
    needs_review: allClaims.filter((c) => c.status === "needs_review").length,
    verified: allClaims.filter((c) => c.status === "verified").length,
  };

  await logAdminAuditEvent(sb, request, "admin.verify_claim.list", {
    result_count: documents.length,
    total_docs: count ?? 0,
    count: count ?? 0,
    limit,
    offset,
    page,
    status,
    search,
    claim_status: claimStatus,
    doc_status: docStatus,
    country: country ?? null,
    lang: lang ?? null,
    category: category ?? null,
    slug: slug ?? null,
    sort,
  });

  return NextResponse.json({
    documents,
    // HEAD-compatible fields
    count: count ?? 0,
    limit,
    offset,
    has_more: offset + limit < (count ?? 0),
    // PR-compatible fields
    pagination: {
      page,
      limit,
      total: count ?? 0,
      total_pages: Math.ceil((count ?? 0) / limit),
    },
    claim_stats: claimStats,
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
  const sourceCandidateId = clean(body.source_candidate_id);
  const source = (body.source ?? body) as SourceInput;
  const sourceType = clean(source.source_type) ?? "official";
  const title = clean(source.title);
  const url = clean(source.url);
  const citation = clean(source.citation) ?? clean(body.citation);
  const shouldAttachSource = ["verify", "attach_source"].includes(action) || Boolean(title || url || citation);
  const sourceTrust = scoreSourceTrust({
    url,
    source_type: sourceType,
    fetch_ok: typeof body.fetch_ok === "boolean" ? body.fetch_ok : null,
    title,
    observed_at: observedAt,
    claim_text: String(body.claim_text ?? "").trim(),
  });

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
      const { error: sourceError } = await sb.from("claim_sources").insert({
        id: sourceId,
        claim_id: claimId,
        source_type: sourceType,
        title,
        url,
        citation,
        observed_at: observedAt,
        contributor_hash: contributorHash,
        source_check_status: String(body.source_check_status ?? sourceTrust.source_check_status),
        source_trust_score: Number(body.source_trust_score ?? sourceTrust.source_trust_score),
        source_check_notes: Array.isArray(body.source_check_notes) ? body.source_check_notes.join(" ") : sourceTrust.source_check_notes.join(" "),
      });
      if (sourceError) throw new Error(`source insert failed: ${sourceError.message}`);
      await writeVerificationEvent(sb, existingClaim, "source_added", { note: citation ?? title ?? url, contributor_hash: contributorHash });
      if (sourceCandidateId) {
        await sb.from("source_candidates").update({
          review_status: "accepted",
          reviewed_at: new Date().toISOString(),
          linked_claim_source_id: sourceId,
        }).eq("id", sourceCandidateId);
      }
      await awardContributionPoints(sb, {
        contributor_hash: contributorHash,
        source_candidate_id: sourceCandidateId,
        claim_id: claimId,
        event_type: "source_admin_accepted",
        points: ADMIN_ACCEPTED_SOURCE_POINTS,
        reason: "Admin accepted source candidate for claim review",
      });
      if (contributorHash) {
        await recordContributionEvent(sb, {
          contributor_hash: contributorHash,
          event_type: "source_accepted",
          country: clean(body.country),
          source_type: sourceType,
          claim_id: claimId,
          document_id: existingClaim.document_id,
        });
      }
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
      if (action === "verify" && shouldAttachSource) {
        if (sourceCandidateId) {
          await sb.from("source_candidates").update({ review_status: "linked_to_claim", reviewed_at: new Date().toISOString() }).eq("id", sourceCandidateId);
        }
        await awardContributionPoints(sb, {
          contributor_hash: contributorHash,
          source_candidate_id: sourceCandidateId,
          claim_id: claimId,
          event_type: "source_linked_verified_claim",
          points: VERIFIED_CLAIM_LINK_POINTS,
          reason: "Accepted source was linked to a verified claim",
        });
      }
      if (action === "verify" && contributorHash) {
        await recordContributionEvent(sb, {
          contributor_hash: contributorHash,
          event_type: "claim_verified_from_contribution",
          country: clean(body.country),
          source_type: shouldAttachSource ? sourceType : null,
          claim_id: claimId,
          document_id: existingClaim.document_id,
        });
      }
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
      source_check_status: shouldAttachSource ? String(body.source_check_status ?? sourceTrust.source_check_status) : null,
      source_trust_score: shouldAttachSource ? Number(body.source_trust_score ?? sourceTrust.source_trust_score) : null,
      previous_status: existingClaim.status,
      new_status: nextStatus,
      previous_confidence: existingClaim.confidence,
      new_confidence: nextConfidence,
      document_all_verified: documentAllVerified,
    });

    if (contributorHash && action === "verify") {
      await awardPoints(sb, contributorHash, 'source_used_in_verified_claim', POINT_VALUES.source_used_in_verified_claim, {
        referenceId: claimId,
        referenceType: 'claim',
      });
      await checkAndAwardBadges(sb, contributorHash);
    }

    return NextResponse.json({ claim: updatedClaim, source_id: sourceId, source_trust_score: sourceId ? sourceTrust.source_trust_score : null, document_all_verified: documentAllVerified });
  } catch (error) {
    if (sourceId) await sb.from("claim_sources").delete().eq("id", sourceId);
    const message = error instanceof Error ? error.message : "claim action failed";
    await logAdminAuditEvent(sb, request, `admin.verify_claim.${action}_failed`, { claim_id: claimId, error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
