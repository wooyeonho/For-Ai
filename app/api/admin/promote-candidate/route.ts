import { NextResponse } from "next/server";

import { logAdminAuditEvent, requireAdmin, supabaseAdmin } from "@/lib/admin-api";
import { UNKNOWN_FACT_TEXT } from "@/lib/citation-status";

function stableId(prefix: string, slug: string): string {
  return `${prefix}-${slug}`.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 120);
}

export async function POST(request: Request) {
  const adminError = await requireAdmin(request, "candidates.promote");
  if (adminError) return adminError;

  const body = await request.json();
  const { candidateId } = body;
  if (!candidateId) return NextResponse.json({ error: "candidateId 필요" }, { status: 400 });

  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });

  const { data: candidate, error: fetchErr } = await sb
    .from("topic_candidates")
    .select("*")
    .eq("id", candidateId)
    .single();

  if (fetchErr || !candidate) return NextResponse.json({ error: "후보를 찾을 수 없습니다" }, { status: 404 });
  if (candidate.status === "promoted") return NextResponse.json({ error: "이미 등록된 후보입니다" }, { status: 409 });
  if (candidate.status !== "generated") {
    return NextResponse.json({ error: `AI claim generation이 완료된 후보만 등록 가능합니다 (현재: ${candidate.status})` }, { status: 400 });
  }

  const lang = String(candidate.lang ?? "").trim();
  const country = String(candidate.country ?? "").trim();
  if (!lang || !country) return NextResponse.json({ error: "candidate lang and country are required" }, { status: 400 });
  const slug = candidate.slug as string;
  const entityId = stableId("entity", slug);
  const documentId = stableId("doc", `${slug}-${lang}`);
  const listingId = stableId("listing", `${slug}-${lang}`);

  // Check for duplicate document
  const { data: existingDoc } = await sb
    .from("documents")
    .select("id, slug")
    .eq("slug", slug)
    .eq("lang", lang)
    .eq("country", country)
    .maybeSingle();
  if (existingDoc) return NextResponse.json({ error: `slug "${slug}" 이미 존재합니다` }, { status: 409 });

  // Check for duplicate entity
  const { data: existingEntity } = await sb
    .from("entities")
    .select("id")
    .eq("id", entityId)
    .maybeSingle();
  if (existingEntity) return NextResponse.json({ error: `entity "${entityId}" 이미 존재합니다` }, { status: 409 });

  // ── Insert entity ────────────────────────────────────────────────────────
  const { error: entityErr } = await sb.from("entities").insert({
    id: entityId,
    canonical_name: candidate.title,
    type: candidate.category ?? "concept",
    country,
  });
  if (entityErr) {
    return NextResponse.json({ error: "entity 생성 실패", detail: entityErr.message }, { status: 500 });
  }

  // ── Insert document ──────────────────────────────────────────────────────
  const { error: docErr } = await sb.from("documents").insert({
    id: documentId,
    entity_id: entityId,
    slug,
    title: candidate.title,
    template: "fact-sheet",
    lang,
    country,
    // Promoted AI candidates are public review records, not verified/citable documents.
    // Keep the document in needs_review until human source-backed claim verification is complete.
    status: "needs_review",
    confidence: "low",
    category: candidate.category,
    data: {
      source_hints: candidate.source_hints ?? [],
      why_people_ask_ai: candidate.why_people_ask_ai ?? null,
      why_ai_gets_wrong: candidate.why_ai_gets_wrong ?? null,
      promoted_from_candidate: candidateId,
    },
  });
  if (docErr) {
    await sb.from("entities").delete().eq("id", entityId);
    return NextResponse.json({ error: "document 생성 실패", detail: docErr.message }, { status: 500 });
  }

  // ── Insert claims ────────────────────────────────────────────────────────
  const claims = (candidate.claims ?? []) as {
    question: string;
    placeholder_value?: string;
    required_source_type?: string;
    claim_value?: string;
    confidence?: string;
    status?: string;
    last_verified_at?: string;
    sources?: unknown[];
    verification_event?: unknown;
  }[];
  const unsafeVerifiedCandidate = claims.find((claim) => (
    claim.status === "verified" ||
    claim.confidence === "medium" ||
    claim.confidence === "high" ||
    Boolean(claim.last_verified_at) ||
    (claim.sources ?? []).length > 0 ||
    Boolean(claim.verification_event) ||
    (Boolean(claim.claim_value?.trim()) && claim.claim_value !== UNKNOWN_FACT_TEXT)
  ));
  if (unsafeVerifiedCandidate) {
    return NextResponse.json({
      error: "candidate promotion cannot create verified claims; use admin verify-claim approval with sources and a verification event",
    }, { status: 422 });
  }

  if (claims.length > 0) {
    const claimRows = claims.map((cl, i) => ({
      id: stableId("claim", `${slug}-${i + 1}`),
      document_id: documentId,
      entity_id: entityId,
      field_path: `claim_${i + 1}`,
      claim_value: "확인 필요",
      claim_text: cl.question,
      confidence: "low" as const,
      status: "needs_review" as const,
    }));
    const { error: claimsErr } = await sb.from("claims").insert(claimRows);
    if (claimsErr) {
      await sb.from("documents").delete().eq("id", documentId);
      await sb.from("entities").delete().eq("id", entityId);
      return NextResponse.json({ error: "claims 생성 실패", detail: claimsErr.message }, { status: 500 });
    }
  }

  // ── Insert listing ───────────────────────────────────────────────────────
  const { error: listingErr } = await sb.from("listings").insert({
    id: listingId,
    entity_id: entityId,
    document_id: documentId,
    lang,
    slug,
    title: candidate.title,
    summary: claims.length > 0 ? `${claims.length}개 claim 확인 필요` : null,
    // Promoted AI candidates are public review records, not verified/citable documents.
    // Keep the document in needs_review until human source-backed claim verification is complete.
    status: "needs_review",
    confidence: "low",
  });
  if (listingErr) {
    if (claims.length > 0) {
      await sb.from("claims").delete().eq("document_id", documentId);
    }
    await sb.from("documents").delete().eq("id", documentId);
    await sb.from("entities").delete().eq("id", entityId);
    return NextResponse.json({ error: "listing 생성 실패", detail: listingErr.message }, { status: 500 });
  }

  // ── Mark candidate as promoted ───────────────────────────────────────────
  const { error: promoteErr } = await sb
    .from("topic_candidates")
    .update({ status: "promoted", promoted_at: new Date().toISOString() })
    .eq("id", candidateId);
  if (promoteErr) {
    // Non-critical: entity/doc/claims/listing were created. Log but don't roll back.
    console.error("[promote-candidate] status update failed:", promoteErr.message);
  }

  await logAdminAuditEvent(sb, request, "admin.candidates.promote", {
    candidate_id: candidateId,
    entity_id: entityId,
    document_id: documentId,
    slug,
    claims_created: claims.length,
  });

  return NextResponse.json({
    success: true,
    entity_id: entityId,
    document_id: documentId,
    slug,
    url: `/${lang}/wiki/${slug}`,
    claims_created: claims.length,
  });
}
