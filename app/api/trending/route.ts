import { NextResponse } from "next/server";
import { createServerClient } from "../../../lib/supabase-server";
import { checkRateLimit, rateLimitHeaders, rateLimitResponse } from "../../../lib/api-rate-limit";
import { documentPageUrl } from "../../../lib/urls";

export const revalidate = 300;

export type TrendingItem = {
  document_id: string;
  slug: string;
  title: string;
  category: string;
  lang: string;
  ai_citation_count: number;
  human_view_count: number;
  view_count: number;
  api_cite_count: number;
  citation_copy_count: number;
  hallucination_count: number;
  page_url: string;
};

export type TrendingResponse = {
  ai_trending: TrendingItem[];
  human_trending: TrendingItem[];
  hallucination_trending: TrendingItem[];
  total_ai_citations: number;
  total_human_views: number;
  total_views: number;
  total_hallucinations: number;
  generated_at: string;
};

export async function GET(request: Request) {
  const rateLimit = await checkRateLimit(request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "10"), 20);
  const lang = url.searchParams.get("lang") ?? null;

  try {
    const sb = createServerClient();

    const { data: stats, error } = await sb
      .from("document_stats")
      .select("document_id, view_count, ai_citation_count, human_view_count, bot_view_count, api_cite_count, citation_copy_count")
      .order("view_count", { ascending: false })
      .limit(200);

    if (error) throw error;

    if (!stats || stats.length === 0) {
      return NextResponse.json(
        { ai_trending: [], human_trending: [], hallucination_trending: [], total_ai_citations: 0, total_human_views: 0, total_views: 0, total_hallucinations: 0, generated_at: new Date().toISOString() },
        { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600", ...rateLimitHeaders(rateLimit) } }
      );
    }

    const docIds = stats.map((s) => s.document_id);
    let docsQuery = sb.from("documents").select("id, title, slug, lang, category, status").in("id", docIds);
    if (lang) docsQuery = docsQuery.eq("lang", lang);
    const { data: docs } = await docsQuery;

    const docMap = new Map((docs ?? []).map((d) => [d.id, d]));

    const { data: hallucinationRows } = await sb
      .from("hallucination_reports")
      .select("document_id")
      .eq("status", "accepted");

    const hallucinationCounts = new Map<string, number>();
    for (const row of hallucinationRows ?? []) {
      if (row.document_id) {
        hallucinationCounts.set(row.document_id, (hallucinationCounts.get(row.document_id) ?? 0) + 1);
      }
    }

    const enriched: TrendingItem[] = stats
      .filter((s) => docMap.has(s.document_id))
      .map((s) => {
        const doc = docMap.get(s.document_id)!;
        return {
          document_id: s.document_id,
          slug: doc.slug,
          title: doc.title,
          category: doc.category,
          lang: doc.lang,
          ai_citation_count: Number(s.ai_citation_count ?? 0),
          human_view_count: Number(s.human_view_count ?? s.view_count ?? 0),
          view_count: Number(s.view_count ?? 0),
          api_cite_count: Number(s.api_cite_count ?? 0),
          citation_copy_count: Number(s.citation_copy_count ?? 0),
          hallucination_count: hallucinationCounts.get(s.document_id) ?? 0,
          page_url: documentPageUrl(doc.slug, doc.lang),
        };
      });

    const aiTrending = [...enriched]
      .sort((a, b) =>
        (b.ai_citation_count + b.api_cite_count + b.citation_copy_count) -
        (a.ai_citation_count + a.api_cite_count + a.citation_copy_count)
      )
      .filter((d) => d.ai_citation_count + d.api_cite_count + d.citation_copy_count > 0)
      .slice(0, limit);

    const humanTrending = [...enriched]
      .sort((a, b) => b.human_view_count - a.human_view_count)
      .filter((d) => d.human_view_count > 0)
      .slice(0, limit);

    const hallucinationTrending = [...enriched]
      .sort((a, b) => b.hallucination_count - a.hallucination_count)
      .filter((d) => d.hallucination_count > 0)
      .slice(0, limit);

    const totalAiCitations = enriched.reduce((sum, d) => sum + d.ai_citation_count, 0);
    const totalHumanViews = enriched.reduce((sum, d) => sum + d.human_view_count, 0);
    const totalViews = enriched.reduce((sum, d) => sum + d.view_count, 0);
    const totalHallucinations = enriched.reduce((sum, d) => sum + d.hallucination_count, 0);

    const body: TrendingResponse = {
      ai_trending: aiTrending,
      human_trending: humanTrending,
      hallucination_trending: hallucinationTrending,
      total_ai_citations: totalAiCitations,
      total_human_views: totalHumanViews,
      total_views: totalViews,
      total_hallucinations: totalHallucinations,
      generated_at: new Date().toISOString(),
    };

    return NextResponse.json(body, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        ...rateLimitHeaders(rateLimit),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "trending query failed";
    return NextResponse.json({ error: message }, { status: 500, headers: rateLimitHeaders(rateLimit) });
  }
}
