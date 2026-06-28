import { NextResponse } from "next/server";
import { getEntityProfile } from "../../../../lib/entity-profile";
import { getDocumentCitationStatus } from "../../../../lib/citation-status";
import { documentPageUrl, apiDocumentUrl, rawMarkdownUrl, entityPageUrl } from "../../../../lib/urls";
import { DEFAULT_LOCALE } from "../../../../lib/i18n/locales";
import { checkRateLimit, rateLimitHeaders, rateLimitResponse } from "../../../../lib/api-rate-limit";

// Machine-readable entity profile: an entity plus every document/claim For-Ai
// holds about it, with a citable summary. Lets an AI cite at the entity level
// and see which documents are human-approved. X-For-Ai-Can-Cite is true when at
// least one document about the entity is citable.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rateLimit = await checkRateLimit(request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const { id } = await params;
  const profile = await getEntityProfile(decodeURIComponent(id));

  if (!profile) {
    return NextResponse.json({ error: "Entity not found" }, { status: 404, headers: rateLimitHeaders(rateLimit) });
  }

  const { entity, documents, summary } = profile;

  const body = {
    entity: {
      id: entity.id,
      type: entity.type,
      canonical_name: entity.canonical_name,
      country: entity.country,
      region: entity.region,
      city: entity.city,
    },
    summary,
    citation_policy:
      'Cite a document only when can_cite=true (human-approved + every claim verified). Never cite values shown as "확인 필요", low confidence, or needs_review status.',
    page_url: entityPageUrl(entity.id, documents[0]?.document.lang ?? DEFAULT_LOCALE),
    documents: documents.map((bundle) => {
      const status = getDocumentCitationStatus(bundle);
      return {
        slug: bundle.document.slug,
        title: bundle.document.title,
        lang: bundle.document.lang,
        status: bundle.document.status,
        confidence: bundle.document.confidence,
        can_cite: status.isVerifiedDocument,
        freshness: status.freshness,
        verified_claims: status.verifiedClaims,
        total_claims: status.totalClaims,
        last_verified_at: bundle.document.last_verified_at,
        urls: {
          page: documentPageUrl(bundle.document.slug, bundle.document.lang),
          json: apiDocumentUrl(bundle.document.slug),
          markdown: rawMarkdownUrl(bundle.document.slug),
        },
      };
    }),
  };

  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      "X-For-Ai-Can-Cite": summary.citable_documents > 0 ? "true" : "false",
      ...rateLimitHeaders(rateLimit),
    },
  });
}
