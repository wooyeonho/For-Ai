import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { makeContributorHashForRequest } from "@/lib/contributor-hash";
import { buildPublicTopicCandidate } from "@/lib/topic-candidates";
import {
  hasHoneypotValue,
  inspectSubmissionText,
} from "@/lib/submission-limits";
import { rateLimited } from "@/lib/rate-limit";
import { invalidPublicSourceUrl, parsePublicSourceUrl } from "@/lib/source-contributions";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

const SUPPORTED_LANGUAGES = new Set(["en", "ko", "ja", "zh", "es", "hi", "ar"]);
const MAX_PER_HOUR = 5;
const HOUR_MS = 60 * 60 * 1000;

function text(body: Record<string, unknown>, key: string, max = 500): string {
  return String(body[key] ?? "").trim().slice(0, max);
}


function optionalEmail(value: string): string | null {
  if (!value) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value.slice(0, 254) : null;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9가-힣\u3040-\u30ff\u3400-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || `suggested-topic-${Date.now()}`;
}

function looksLikeSpam(fields: string[]): boolean {
  const combined = fields.join("\n").toLowerCase();
  const urlCount = (combined.match(/https?:\/\//g) ?? []).length;
  const blockedTerms = ["casino", "viagra", "crypto giveaway", "loan guaranteed"];
  return urlCount > 3 || blockedTerms.some((term) => combined.includes(term));
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  // honeypot check (submission-limits) + new global fields
  if (hasHoneypotValue(body)) {
    return NextResponse.json({ accepted: true, status: "candidate", raw_ip_stored: false });
  }

  const question = text(body, "question", 300);
  const country = text(body, "country", 120);
  const cityRegion = text(body, "city_region", 120) || text(body, "city", 120) || null;
  const category = text(body, "category", 80);
  const languageInput = text(body, "language", 10) || text(body, "lang", 10) || "en";
  const language = SUPPORTED_LANGUAGES.has(languageInput) ? languageInput : "en";
  const whyThisMatters = text(body, "why_this_matters", 1000) || text(body, "reason", 1000);
  const sourceUrlInput = text(body, "source_url", 2048);
  const parsedSourceUrl = sourceUrlInput ? parsePublicSourceUrl(sourceUrlInput) : null;
  const sourceUrl = parsedSourceUrl?.ok ? parsedSourceUrl.url : null;
  const emailInput = text(body, "email", 254);
  const email = optionalEmail(emailInput);
  const honeypot = text(body, "website", 200);

  if (honeypot) {
    return NextResponse.json({ accepted: true, status: "candidate", raw_ip_stored: false });
  }

  if (!question || !country || !category || !language || !whyThisMatters) {
    return NextResponse.json(
      { error: "question, country, category, language, and why_this_matters are required" },
      { status: 400 }
    );
  }

  if (parsedSourceUrl && !parsedSourceUrl.ok) {
    const invalidUrl = invalidPublicSourceUrl();
    return NextResponse.json({ error: invalidUrl.error, code: invalidUrl.code }, { status: invalidUrl.status });
  }

  if (emailInput && !email) {
    return NextResponse.json({ error: "email must be valid when provided" }, { status: 400 });
  }

  if (looksLikeSpam([question, country, cityRegion ?? "", category, whyThisMatters, sourceUrl ?? ""])) {
    return NextResponse.json({ error: "spam_detected" }, { status: 422 });
  }

  let contributorHash: string;
  try {
    contributorHash = makeContributorHashForRequest(request);
  } catch (error) {
    console.error("[suggest-topic] Contributor salt missing:", error);
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  if (rateLimited("suggest-topic", contributorHash, MAX_PER_HOUR, HOUR_MS)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  if (!SUPABASE_URL || !SUPABASE_ANON) {
    return NextResponse.json(
      { accepted: false, error: "DB not configured — submission was not stored" },
      { status: 503 }
    );
  }

  const spamCheck = inspectSubmissionText([question, country, cityRegion ?? "", category, whyThisMatters, sourceUrl ?? ""]);

  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON);
    const suggestionPayload = {
      contributor_hash: contributorHash,
      question,
      country,
      city_region: cityRegion,
      category,
      language,
      reason: whyThisMatters,
      source_url: sourceUrl,
      contact_email: email,
      status: spamCheck.status,
    };

    const candidatePayload = {
      ...buildPublicTopicCandidate({
        kind: "topic_suggestion",
        title: question,
        slugSeed: `${country}-${cityRegion ?? "global"}-${question}-${Date.now().toString(36)}`,
        lang: language,
        category,
        reason: whyThisMatters,
        aiContext: `Country: ${country}${cityRegion ? `, ${cityRegion}` : ""}`,
        sourceUrls: [sourceUrl],
        contributorHash,
        claimQuestion: question,
      }),
      status: spamCheck.status,
      country: country.toLowerCase(),
      subcategory: cityRegion,
    };

    const [{ error: suggestionError }, { error: candidateError }] = await Promise.all([
      sb.from("topic_suggestions").insert(suggestionPayload),
      sb.from("topic_candidates").insert(candidatePayload),
    ]);

    if (suggestionError || candidateError) {
      console.error("[suggest-topic] Supabase insert failed", { suggestionError, candidateError });
      return NextResponse.json(
        { accepted: false, error: "Failed to save suggestion — please try again later" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("[suggest-topic] Unexpected save failure", error);
    return NextResponse.json(
      { accepted: false, error: "Failed to save suggestion — please try again later" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    accepted: true,
    status: spamCheck.status === "spam_suspected" ? "spam_suspected" : "candidate",
    admin_queue: "topic_candidates.status=new",
    raw_ip_stored: false,
  });
}
