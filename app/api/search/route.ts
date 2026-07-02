import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, rateLimitHeaders, rateLimitResponse } from "../../../lib/api-rate-limit";

export const revalidate = 60;

export type SearchResult = {
  type: "document" | "claim";
  document_id: string;
  slug: string;
  title: string;
  category: string;
  lang: string;
  excerpt?: string;
};

export type SearchResponse = {
  results: SearchResult[];
  query: string;
  total: number;
};

export async function GET(request: Request) {
  const rateLimit = await checkRateLimit(request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const lang = url.searchParams.get("lang") ?? null;
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "10"), 30);

  if (!q || q.length < 1) {
    return NextResponse.json({ results: [], query: q, total: 0 }, { headers: rateLimitHeaders(rateLimit) });
  }

  // Escape LIKE wildcards so user-supplied % / _ / \ are matched literally
  // instead of turning every query into a broad wildcard scan.
  const likePattern = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "DB not configured" }, { status: 500, headers: rateLimitHeaders(rateLimit) });
  }

  try {
    const sb = createClient(supabaseUrl, supabaseKey);

    let docQuery = sb
      .from("documents")
      .select("id, slug, title, category, lang")
      .ilike("title", likePattern)
      .in("status", ["published", "verified"])
      .limit(limit);
    if (lang) docQuery = docQuery.eq("lang", lang);
    const { data: docResults } = await docQuery;

    const claimQuery = sb
      .from("claims")
      .select("id, document_id, claim_value, field_path, documents!inner(id, slug, title, category, lang, status)")
      .ilike("claim_value", likePattern)
      .eq("status", "verified")
      .limit(limit);
    const { data: claimResults } = await claimQuery;

    const seen = new Set<string>();
    const results: SearchResult[] = [];

    for (const d of docResults ?? []) {
      if (!seen.has(d.id)) {
        seen.add(d.id);
        results.push({ type: "document", document_id: d.id, slug: d.slug, title: d.title, category: d.category ?? "", lang: d.lang });
      }
    }

    type JoinedDoc = { id: string; slug: string; title: string; category: string; lang: string; status: string };
    for (const c of claimResults ?? []) {
      // Supabase `documents!inner(...)` can surface the joined row as an object or a single-element array.
      const docRaw = c.documents as unknown;
      const doc = (Array.isArray(docRaw) ? docRaw[0] : docRaw) as JoinedDoc | null | undefined;
      if (!doc) continue;
      if (seen.has(doc.id)) continue;
      if (lang && doc.lang !== lang) continue;
      seen.add(doc.id);
      results.push({
        type: "claim",
        document_id: doc.id,
        slug: doc.slug,
        title: doc.title,
        category: doc.category ?? "",
        lang: doc.lang,
        excerpt: String(c.claim_value ?? "").slice(0, 120),
      });
    }

    return NextResponse.json(
      { results: results.slice(0, limit), query: q, total: results.length },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120", ...rateLimitHeaders(rateLimit) } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "search failed";
    return NextResponse.json({ error: message }, { status: 500, headers: rateLimitHeaders(rateLimit) });
  }
}
