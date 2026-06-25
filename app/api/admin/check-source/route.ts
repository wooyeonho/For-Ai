import { NextResponse } from "next/server";

import { logAdminAuditEvent, requireAdmin, supabaseAdmin } from "@/lib/admin-api";

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
  const adminError = requireAdmin(request, "claims.check_source");
  if (adminError) return adminError;

  const body = await request.json().catch(() => ({}));
  const url = String(body.url ?? "").trim();
  const match = String(body.match ?? "").trim();

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
      headers: { "user-agent": "For-Ai-SourceCheck/1.0 (+https://for-ai-e4mm.vercel.app)" },
    });
    clearTimeout(timeout);

    const contentType = res.headers.get("content-type") ?? "";
    const isHtml = contentType.includes("html") || contentType.includes("text") || contentType === "";

    let exactMatch: boolean | null = null;
    let tokenMatch: { matched: string[]; missing: string[] } | null = null;
    let snippet: string | null = null;

    if (res.ok && isHtml) {
      const raw = (await res.text()).slice(0, MAX_BYTES);
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

    const sb = supabaseAdmin();
    if (sb) {
      await logAdminAuditEvent(sb, request, "admin.check_source", {
        host: parsed.hostname,
        status: res.status,
        ok: res.ok,
        exact_match: exactMatch,
      });
    }

    return NextResponse.json({
      url: parsed.toString(),
      reachable: res.ok,
      status: res.status,
      content_type: contentType || null,
      elapsed_ms: Date.now() - startedAt,
      exact_match: exactMatch,
      token_match: tokenMatch,
      snippet,
    });
  } catch (err) {
    clearTimeout(timeout);
    const aborted = err instanceof Error && err.name === "AbortError";
    return NextResponse.json({
      url: parsed.toString(),
      reachable: false,
      status: 0,
      error: aborted ? `시간 초과 (${FETCH_TIMEOUT_MS}ms)` : `요청 실패: ${err instanceof Error ? err.message : String(err)}`,
      elapsed_ms: Date.now() - startedAt,
    });
  }
}
