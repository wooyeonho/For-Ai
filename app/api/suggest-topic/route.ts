import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { makeContributorHashForRequest } from "@/lib/contributor-hash";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const question    = String(body.question    ?? "").trim();
  const category    = String(body.category    ?? "").trim();
  const suggestedSlug = String(body.suggested_slug ?? "").trim() || null;
  const reason      = String(body.reason      ?? "").trim();
  const sourceUrl   = String(body.source_url  ?? "").trim() || null;
  const relatedUrl  = String(body.related_url ?? "").trim() || null;
  const aiContext   = String(body.ai_context  ?? "").trim() || null;

  if (!question || !category || !reason) {
    return NextResponse.json(
      { error: "question, category, and reason are required" },
      { status: 400 }
    );
  }

  let hash: string;
  try {
    hash = makeContributorHashForRequest(request);
  } catch (error) {
    console.error('[suggest-topic] Contributor salt missing:', error);
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  // Try to save to topic_candidates
  let storage: "db" | "stub" = "stub";
  if (SUPABASE_URL && SUPABASE_ANON) {
    try {
      const sb = createClient(SUPABASE_URL, SUPABASE_ANON);
      const { error: suggestionError } = await sb.from("topic_suggestions").insert({
        contributor_hash: hash,
        question,
        category,
        reason,
        related_url: relatedUrl,
        source_url: sourceUrl,
        status: "new",
      });
      if (!suggestionError) storage = "db";

      const { error } = await sb.from("topic_candidates").insert({
        source: "user_suggested",
        status: "new",
        lang: "ko",
        title: question,
        slug: suggestedSlug ?? question.toLowerCase().replace(/[^a-z0-9가-힣]+/g, "-").slice(0, 80),
        category,
        risk_tier: "medium",
        why_people_ask_ai: reason,
        why_ai_gets_wrong: aiContext,
        claims: [{
          field_path: "claim.main",
          question,
          placeholder_value: "확인 필요",
          required_source_type: sourceUrl ? "official" : "document",
        }],
        source_hints: sourceUrl ? [{ url: sourceUrl, title: "제보자 제출", hint_type: "official" }] : [],
        contributor_hash: hash,
      });
      if (!error) storage = "db";
    } catch {
      // fallback to stub — don't fail the user
    }
  }

  return NextResponse.json({
    accepted: true,
    status: "new",
    storage,
    raw_ip_stored: false,
  });
}
