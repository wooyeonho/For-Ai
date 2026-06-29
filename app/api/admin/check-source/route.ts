import { NextResponse } from "next/server";

import { logAdminAuditEvent, requireAdmin, supabaseAdmin } from "@/lib/admin-api";
import { scoreSourceTrust } from "@/lib/source-trust";
import { siteUrl } from "@/lib/urls";

const SOURCE_CHECK_UA = `For-Ai-SourceCheck/1.0 (+${siteUrl("").replace(/\/+$/, "")})`;
const FETCH_TIMEOUT_MS = 8000;
const MAX_BYTES = 1_500_000;

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

// Pull a few tokens out of the claim value (numbers, currency, dates, keywords)
// so a near-miss in formatting still surfaces a partial match for the admin.
function matchTokens(text: string, needle: string): { matched: string[]; missing: string[] } {
  const tokens = [...new Set(
    needle
      .split(/[\s,/·]+/)
      .map((t) => t.replace(/[()[\]{}"']/g, "").trim())
      .filter((t) => t.length >= 2),
  )];
  const haystack = normalize(text);
  const matched: string[] = [];
  const missing: string[] = [];
  for (const token of tokens) {
    if (haystack.includes(normalize(token))) matched.push(token);
    else missing.push(token);
  }
  return { matched, missing };
}

export async function POST(request: Request) {
  const adminError = await requireAdmin(request, "claims.check_source");
  if (adminError) return adminError;

  const body = await request.json().catch(() => ({}));
  const url = String(body.url ?? "").trim();
  const match = String(body.match ?? "").trim();
  const claimText = String(body.claim_text ?? "").trim();
  const sourceType = String(body.source_type ?? "unknown").trim();
  const suppliedTitle = String(body.title ?? "").trim();
  const observedAt = String(body.observed_at ?? new Date().toISOString()).trim();

  if (!url) return NextResponse.json({ error: "url is required" }, { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return NextResponse.json({ error: "only http(s) urls are allowed" }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const res = await fetch(parsed.toString(), {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": SOURCE_CHECK_UA },
    });
    clearTimeout(timeout);

    const contentType = res.headers.get("content-type") ?? "";
    const isHtml = contentType.includes("html") || contentType.includes("text") || contentType === "";

    let exactMatch: boolean | null = null;
    let tokenMatch: { matched: string[]; missing: string[] } | null = null;
    let snippet: string | null = null;
    let extractedTitle: string | null = null;

    if (res.ok && isHtml) {
      const raw = (await res.text()).slice(0, MAX_BYTES);
      const titleMatch = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      extractedTitle = titleMatch ? stripHtml(titleMatch[1]) : null;
      const text = stripHtml(raw);
      if (match) {
        exactMatch = normalize(text).includes(normalize(match));
        tokenMatch = matchTokens(text, match);
        const idx = normalize(text).indexOf(normalize(match));
        if (idx >= 0) {
          const start = Math.max(0, idx - 60);
          snippet = text.slice(start, idx + match.length + 60).trim();
        }
      }
    }

    const trust = scoreSourceTrust({
      url: parsed.toString(),
      source_type: sourceType,
      fetch_ok: res.ok,
      title: suppliedTitle || extractedTitle,
      observed_at: observedAt,
      claim_text: claimText || match,
    });

    const sb = supabaseAdmin();
    if (sb) {
      await logAdminAuditEvent(sb, request, "admin.check_source", {
        host: parsed.hostname,
        status: res.status,
        ok: res.ok,
        exact_match: exactMatch,
        source_check_status: trust.source_check_status,
        source_trust_score: trust.source_trust_score,
      });
    }

    return NextResponse.json({
      url: parsed.toString(),
      reachable: res.ok,
      status: res.status,
      content_type: contentType || null,
      extracted_title: extractedTitle,
      source_check_status: trust.source_check_status,
      source_trust_score: trust.source_trust_score,
      source_check_notes: trust.source_check_notes,
      source_check_details: trust.checks,
      elapsed_ms: Date.now() - startedAt,
      exact_match: exactMatch,
      token_match: tokenMatch,
      snippet,
    });
  } catch (err) {
    clearTimeout(timeout);
    const aborted = err instanceof Error && err.name === "AbortError";
    const trust = scoreSourceTrust({
      url: parsed.toString(),
      source_type: sourceType,
      fetch_ok: false,
      title: suppliedTitle,
      observed_at: observedAt,
      claim_text: claimText || match,
    });
    return NextResponse.json({
      url: parsed.toString(),
      reachable: false,
      status: 0,
      error: aborted ? `시간 초과 (${FETCH_TIMEOUT_MS}ms)` : `요청 실패: ${err instanceof Error ? err.message : String(err)}`,
      elapsed_ms: Date.now() - startedAt,
      source_check_status: trust.source_check_status,
      source_trust_score: trust.source_trust_score,
      source_check_notes: trust.source_check_notes,
      source_check_details: trust.checks,
    });
  }
}
