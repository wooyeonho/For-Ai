import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const ADMIN_SECRET = process.env.ADMIN_SECRET ?? "";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";

function supabaseAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_KEY);
}

export async function POST(request: Request) {
  const auth = request.headers.get("x-admin-secret");
  if (ADMIN_SECRET && auth !== ADMIN_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { candidateId } = body;
  if (!candidateId) {
    return NextResponse.json({ error: "candidateId 필요" }, { status: 400 });
  }

  const sb = supabaseAdmin();

  const { data: candidate, error: fetchErr } = await sb
    .from("topic_candidates")
    .select("*")
    .eq("id", candidateId)
    .single();

  if (fetchErr || !candidate) {
    return NextResponse.json({ error: "후보를 찾을 수 없습니다" }, { status: 404 });
  }

  if (candidate.status === "promoted") {
    return NextResponse.json({ error: "이미 등록된 후보입니다" }, { status: 409 });
  }

  if (candidate.status !== "approved") {
    return NextResponse.json(
      { error: `승인된 후보만 등록 가능합니다 (현재: ${candidate.status})` },
      { status: 400 }
    );
  }

  const { data: existing } = await sb
    .from("registry_documents")
    .select("id, slug")
    .eq("slug", candidate.slug)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: `slug "${candidate.slug}" 이미 존재합니다` },
      { status: 409 }
    );
  }

  const { data: entity, error: entityErr } = await sb
    .from("registry_entities")
    .insert({
      canonical_name: candidate.title,
      entity_type: "concept",
      lang: candidate.lang ?? "ko",
    })
    .select("id")
    .single();

  if (entityErr || !entity) {
    return NextResponse.json(
      { error: "entity 생성 실패", detail: entityErr?.message },
      { status: 500 }
    );
  }

  const { data: document, error: docErr } = await sb
    .from("registry_documents")
    .insert({
      entity_id: entity.id,
      slug: candidate.slug,
      title: candidate.title,
      template: "fact-sheet",
      lang: candidate.lang ?? "ko",
      status: "published",
      confidence: "low",
      category: candidate.category,
      subcategory: candidate.subcategory ?? null,
      why_people_ask_ai: candidate.why_people_ask_ai ?? null,
      why_ai_gets_wrong: candidate.why_ai_gets_wrong ?? null,
      data: { source_hints: candidate.source_hints ?? [] },
      promoted_from_candidate: candidateId,
    })
    .select("id")
    .single();

  if (docErr || !document) {
    await sb.from("registry_entities").delete().eq("id", entity.id);
    return NextResponse.json(
      { error: "document 생성 실패", detail: docErr?.message },
      { status: 500 }
    );
  }

  const claims = (candidate.claims ?? []) as {
    question: string;
    placeholder_value: string;
    required_source_type?: string;
  }[];

  if (claims.length > 0) {
    const claimRows = claims.map((cl, i) => ({
      document_id: document.id,
      field_path: `claim_${i + 1}`,
      claim_value: "확인 필요",
      claim_text: cl.question,
      confidence: "low" as const,
      status: "needs_review" as const,
      required_source_type: cl.required_source_type ?? null,
    }));
    await sb.from("registry_claims").insert(claimRows);
  }

  await sb
    .from("topic_candidates")
    .update({ status: "promoted", promoted_at: new Date().toISOString() })
    .eq("id", candidateId);

  return NextResponse.json({
    success: true,
    entity_id: entity.id,
    document_id: document.id,
    slug: candidate.slug,
    url: `/ko/wiki/${candidate.slug}`,
    claims_created: claims.length,
  });
}
