import { NextResponse } from "next/server";

import { logAdminAuditEvent, requireAdmin, supabaseAdmin } from "@/lib/admin-api";
import { DEFAULT_LOCALE, LOCALE_CONFIG, isValidLocale } from "@/lib/i18n/locales";

// Derive a country from the content language's primary country (ko→KR, en→US,
// ja→JP…) instead of silently defaulting everything to KR.
function countryForLang(lang: string): string {
  return isValidLocale(lang) ? LOCALE_CONFIG[lang].country : "";
}

function stableId(prefix: string, slug: string): string {
  return `${prefix}-${slug}`.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 120);
}

export async function POST(request: Request) {
  const adminError = requireAdmin(request, "candidates.promote");
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
  if (candidate.status !== "approved") {
    return NextResponse.json({ error: `승인된 후보만 등록 가능합니다 (현재: ${candidate.status})` }, { status: 400 });
  }

  const lang = candidate.lang ?? DEFAULT_LOCALE;
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
    country: candidate.country ?? countryForLang(lang),
  });
  if (entityErr) {
    return NextResponse.json({ error: "entity 생성 실패", detail: entityErr.message }, { status: 500 });
  }

  // ── Insert document ──────────────────────────────────────────────────────
  const docCountry = candidate.country ?? countryForLang(lang);
  const { error: docErr } = await sb.from("documents").insert({
    id: documentId,
    entity_id: entityId,
    slug,
    title: candidate.title,
    template: "fact-sheet",
    lang,
    country: docCountry,
    status: "published",
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
  const claims = (candidate.claims ?? []) as { question: string; placeholder_value: string; required_source_type?: string }[];
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
    status: "published",
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
