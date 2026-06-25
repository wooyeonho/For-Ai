import { NextResponse } from "next/server";
import { getRegistryIndex, type RegistryIndexFilters } from "../../../lib/registry-index";
import { documentPageUrl, apiDocumentUrl, rawMarkdownUrl, entityPageUrl, apiEntityUrl } from "../../../lib/urls";

// Public search / discovery index. Lets an external AI or agent find registry
// documents by topic, type, country, language, or citation status WITHOUT
// knowing a slug in advance. Each item reports `can_cite` and machine-readable
// links. Rate limiting is applied by middleware.ts (30/min anon, 120/min keyed).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const p = url.searchParams;

  const filters: RegistryIndexFilters = {
    q: p.get("q")?.trim() || undefined,
    type: p.get("type")?.trim() || undefined,
    country: p.get("country")?.trim() || undefined,
    lang: p.get("lang")?.trim() || undefined,
    cite: p.get("cite") === "true",
  };
  const verification = p.get("verification");
  if (verification === "verified" || verification === "candidate" || verification === "all") {
    filters.verification = verification;
  }

  const limit = Math.min(Math.max(parseInt(p.get("limit") ?? "50", 10) || 50, 1), 200);
  const offset = Math.max(parseInt(p.get("offset") ?? "0", 10) || 0, 0);

  const all = await getRegistryIndex(filters);
  const page = all.slice(offset, offset + limit);
  const nextOffset = offset + limit < all.length ? offset + limit : null;

  const items = page.map((item) => ({
    slug: item.slug,
    title: item.title,
    entity_id: item.entity_id,
    entity_name: item.entity_name,
    type: item.type,
    country: item.country,
    lang: item.lang,
    verification: item.verification,
    confidence: item.confidence,
    status: item.doc_status,
    can_cite: item.can_cite,
    freshness: item.freshness,
    verified_claims: item.verified_claims,
    total_claims: item.total_claims,
    last_verified_at: item.last_verified_at,
    urls: {
      page: documentPageUrl(item.slug, item.lang),
      json: apiDocumentUrl(item.slug),
      markdown: rawMarkdownUrl(item.slug),
      entity: item.entity_id ? entityPageUrl(item.entity_id, item.lang) : null,
      entity_json: item.entity_id ? apiEntityUrl(item.entity_id) : null,
    },
  }));

  return NextResponse.json(
    {
      total: all.length,
      count: items.length,
      limit,
      offset,
      next_offset: nextOffset,
      citation_policy:
        'Cite only items with can_cite=true. Never cite values shown as "확인 필요", low confidence, or needs_review status. Preserve the source URL and last_verified_at.',
      items,
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    },
  );
}
