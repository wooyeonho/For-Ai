import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { makeContributorHashForRequest } from "@/lib/contributor-hash";
import {
  SUGGEST_TOPIC_MESSAGE_MAX_LENGTH,
  contributorSubmissionRateLimited,
  hasHoneypotValue,
  inspectSubmissionText,
} from "@/lib/submission-limits";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export async function POST(request: Request) {
  let body: Record<string, unknown>;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (hasHoneypotValue(body)) {
    return NextResponse.json({ error: "submission rejected", code: "HONEYPOT_FILLED" }, { status: 400 });
  }

  const question    = String(body.question    ?? "").trim();
  const category    = String(body.category    ?? "").trim();
  const suggestedSlug = String(body.suggested_slug ?? "").trim() || null;
  const reason      = String(body.reason      ?? "").trim();
  const sourceUrl   = String(body.source_url  ?? "").trim() || null;
  const relatedUrl  = String(body.related_url ?? "").trim() || null;
  const aiContext   = String(body.ai_context  ?? "").trim() || null;

  if (question.length > SUGGEST_TOPIC_MESSAGE_MAX_LENGTH || reason.length > SUGGEST_TOPIC_MESSAGE_MAX_LENGTH || (aiContext?.length ?? 0) > SUGGEST_TOPIC_MESSAGE_MAX_LENGTH) {
    return NextResponse.json(
      { error: `message fields must be ${SUGGEST_TOPIC_MESSAGE_MAX_LENGTH} characters or fewer`, code: "MESSAGE_TOO_LONG", max_length: SUGGEST_TOPIC_MESSAGE_MAX_LENGTH },
      { status: 400 }
    );
  }

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

  // Supabase must be configured for durable storage
  if (!SUPABASE_URL || !SUPABASE_ANON) {
    return NextResponse.json(
      { accepted: false, error: "DB not configured — submission was not stored" },
      { status: 503 }
    );
  }

  const lang = String(body.lang ?? "en").trim().slice(0, 5);

  let storage: "db" | "none" = "none";
  let submissionStatus = "new";
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON);
    const limit = contributorSubmissionRateLimited(hash);
    if (limit) {
      return NextResponse.json(
        { error: "submission rate limit exceeded", code: `RATE_LIMIT_${limit.toUpperCase()}` },
        { status: 429 }
      );
    }

    const spamCheck = inspectSubmissionText([question, category, reason, sourceUrl, relatedUrl, aiContext]);
    submissionStatus = spamCheck.status;
    const { error: suggestionError } = await sb.from("topic_suggestions").insert({
      contributor_hash: hash,
      question,
      category,
      reason,
      related_url: relatedUrl,
      source_url: sourceUrl,
      status: spamCheck.status,
    });

    const { error } = await sb.from("topic_candidates").insert({
      source: "user_suggested",
      status: spamCheck.status,
      lang,
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

    if (!suggestionError || !error) storage = "db";
  } catch {
    // DB write failed
  }

  if (storage === "none") {
    return NextResponse.json(
      { accepted: false, error: "Failed to save suggestion — please try again later" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    accepted: true,
    status: submissionStatus,
    storage,
    raw_ip_stored: false,
  });
}
