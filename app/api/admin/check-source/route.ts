import { NextResponse } from "next/server";

import { logAdminAuditEvent, requireAdmin, supabaseAdmin } from "@/lib/admin-api";
import { SafeFetchError, safeFetchExternalSource } from "@/lib/safe-fetch-external-source";
import { scoreSourceTrust } from "@/lib/source-trust";

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

  const startedAt = Date.now();

  try {
    const fetched = await safeFetchExternalSource(url);

    let exactMatch: boolean | null = null;
    let tokenMatch: { matched: string[]; missing: string[] } | null = null;
    let snippet: string | null = null;

    if (match) {
      const normalizedText = normalize(fetched.canonicalText);
      exactMatch = normalizedText.includes(normalize(match));
      tokenMatch = matchTokens(fetched.canonicalText, match);
      const idx = normalizedText.indexOf(normalize(match));
      if (idx >= 0) {
        const start = Math.max(0, idx - 60);
        snippet = normalizedText.slice(start, idx + normalize(match).length + 60).trim();
      }
    }

    const trust = scoreSourceTrust({
      url: fetched.finalUrl,
      source_type: sourceType,
      fetch_ok: true,
      title: suppliedTitle || fetched.title,
      observed_at: observedAt,
      claim_text: claimText || match,
    });

    const sb = supabaseAdmin();
    if (sb) {
      await logAdminAuditEvent(sb, request, "admin.check_source", {
        host: new URL(fetched.finalUrl).hostname,
        status: fetched.httpStatus,
        ok: true,
        exact_match: exactMatch,
        source_check_status: trust.source_check_status,
        source_trust_score: trust.source_trust_score,
      });
    }

    return NextResponse.json({
      url: fetched.finalUrl,
      reachable: true,
      status: fetched.httpStatus,
      content_type: fetched.contentType,
      extracted_title: fetched.title,
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
    const safeError = err instanceof SafeFetchError ? err : null;
    const trust = scoreSourceTrust({
      url,
      source_type: sourceType,
      fetch_ok: false,
      title: suppliedTitle,
      observed_at: observedAt,
      claim_text: claimText || match,
    });
    return NextResponse.json({
      url,
      reachable: false,
      status: typeof safeError?.details.status === "number" ? safeError.details.status : 0,
      error: safeError?.code ?? "network_error",
      retry_after_seconds: typeof safeError?.details.retryAfterSeconds === "number" ? safeError.details.retryAfterSeconds : null,
      elapsed_ms: Date.now() - startedAt,
      source_check_status: trust.source_check_status,
      source_trust_score: trust.source_trust_score,
      source_check_notes: trust.source_check_notes,
      source_check_details: trust.checks,
    });
  }
}
