import { NextResponse } from "next/server";
import { buildBadgeSnippet, buildCitationPresentation } from "../../../../lib/citation-presentation";
import { siteUrl } from "../../../../lib/urls";

export const revalidate = 60;

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const presentation = await buildCitationPresentation(slug);
  if (!presentation) return NextResponse.json({ error: "Document not found", slug }, { status: 404 });

  return NextResponse.json({
    slug: presentation.document.slug,
    entity_id: presentation.entity.id,
    title: presentation.document.title,
    status: presentation.docStatus.label,
    can_cite: presentation.canCiteDocument,
    verified_claims: presentation.docStatus.verifiedClaims,
    total_claims: presentation.docStatus.totalClaims,
    freshness: presentation.docStatus.freshness,
    checked_date: presentation.checkedDate,
    canonical_url: presentation.canonicalUrl,
    badge_url: siteUrl(`/embed/${presentation.document.slug}`),
    snippet: buildBadgeSnippet(presentation.document.slug),
  }, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      "X-For-Ai-Can-Cite": presentation.canCiteDocument ? "true" : "false",
    },
  });
}
