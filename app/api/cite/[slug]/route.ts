import { NextRequest, NextResponse } from "next/server";
import { getRegistryBundleBySlug } from "../../../../lib/data";
import { getRegistryBundleFromSupabase } from "../../../../lib/supabase-documents";
import { getDocumentCitationStatus, getClaimCitationStatus } from "../../../../lib/citation-status";
import { siteUrl, documentPageUrl, apiDocumentUrl, rawMarkdownUrl } from "../../../../lib/urls";
import type { RegistryDocumentBundle } from "../../../../lib/types";

export const revalidate = 60;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  let bundle: RegistryDocumentBundle | null = getRegistryBundleBySlug(slug);
  if (!bundle) bundle = await getRegistryBundleFromSupabase(slug);
  if (!bundle) {
    return NextResponse.json(
      { error: "Document not found", slug },
      { status: 404 },
    );
  }

  const { entity, document, claims } = bundle;
  const docStatus = getDocumentCitationStatus(bundle);

  const citableClaims = claims
    .map((claim) => {
      const status = getClaimCitationStatus(claim);
      return {
        field_path: claim.field_path,
        claim_text: claim.claim_text,
        claim_value: claim.claim_value,
        confidence: claim.confidence,
        status: claim.status,
        citation_ready: status.isCitationReady,
        last_verified_at: claim.last_verified_at ?? null,
        sources: claim.sources.map((s) => ({
          url: s.url ?? null,
          title: s.title ?? null,
          source_type: s.source_type,
          observed_at: s.observed_at ?? null,
        })),
      };
    });

  const citation = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: document.title,
    slug: document.slug,
    entity: {
      id: entity.id,
      name: entity.canonical_name,
      type: entity.type,
      country: entity.country,
    },
    citation_status: {
      label: docStatus.label,
      verified_claims: docStatus.verifiedClaims,
      total_claims: docStatus.totalClaims,
      freshness: docStatus.freshness,
      oldest_verified_at: docStatus.oldestVerifiedAt,
    },
    claims: citableClaims,
    endpoints: {
      html: documentPageUrl(document.slug, document.lang),
      json: apiDocumentUrl(document.slug),
      markdown: rawMarkdownUrl(document.slug),
      cite: siteUrl(`/api/cite/${document.slug}`),
    },
    license: "forai-data-license-v0.1",
    citation_policy: "Only cite claims where citation_ready=true. Never cite needs_review or low confidence claims as fact.",
  };

  return NextResponse.json(citation, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      "X-Citation-Status": docStatus.label,
    },
  });
}
