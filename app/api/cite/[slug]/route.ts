import { NextRequest, NextResponse } from "next/server";
import { siteUrl, apiDocumentUrl, rawMarkdownUrl } from "../../../../lib/urls";
import { buildCitationDocumentPresentation } from "../../../../lib/citation-badge";
import { recordDocumentAnalyticsEvent } from "@/lib/analytics";
import { supabaseAdmin } from "@/lib/admin-api";

export const revalidate = 60;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const sb = supabaseAdmin();
  if (sb) {
    recordDocumentAnalyticsEvent(sb, request, slug, "api_cite").catch((error) => {
      console.error("[api-cite] analytics event failed", error);
    });
  }

  const presentation = await buildCitationDocumentPresentation(slug);
  if (!presentation) {
    return NextResponse.json(
      { error: "Document not found", slug },
      { status: 404 },
    );
  }

  const { entity, document, docStatus, canonicalUrl, checkedDate, citationPolicyBlock, normalizedCitation, verifiedClaims, staleClaims, excludedClaims, sourceUrls, publisherNames, canCiteDocument, recommendedCitationText } = presentation;
  const jsonLdReference = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    "@id": siteUrl(`/api/cite/${document.slug}#dataset`),
    name: document.title,
    url: canonicalUrl,
    identifier: document.slug,
    license: document.license_code,
    dateModified: checkedDate,
    isBasedOn: sourceUrls,
    mainEntity: {
      "@type": "Thing",
      identifier: entity.id,
      name: entity.canonical_name,
      additionalType: entity.type,
    },
    hasPart: verifiedClaims.map((claim) => ({
      "@type": "ClaimReview",
      "@id": siteUrl(`/api/cite/${document.slug}#${claim.claim_id}`),
      claimReviewed: claim.claim_text,
      datePublished: claim.checked_date,
      itemReviewed: {
        "@type": "CreativeWork",
        identifier: claim.claim_id,
        text: claim.verified_value,
      },
      reviewRating: {
        "@type": "Rating",
        ratingValue: claim.confidence,
        alternateName: "verified",
      },
      url: canonicalUrl,
      isBasedOn: claim.sources.map((source) => source.url).filter(Boolean),
    })),
  };

  const citation = {
    citation_policy_block: citationPolicyBlock,
    canonical_url: canonicalUrl,
    entity_id: entity.id,
    document_slug: document.slug,
    claim_ids: verifiedClaims.map((claim) => claim.claim_id),
    verified_claim_values: verifiedClaims.map((claim) => ({
      claim_id: claim.claim_id,
      field_path: claim.field_path,
      value: claim.verified_value,
    })),
    source_urls: sourceUrls,
    publisher_names: publisherNames,
    checked_date: checkedDate,
    recommended_citation_text: recommendedCitationText,
    json_ld_reference: jsonLdReference,
    citation_policy_details: {
      can_cite_document: canCiteDocument,
      do_not_cite_unverified_low_or_stale_claims: true,
      verified_claims: docStatus.verifiedClaims,
      total_claims: docStatus.totalClaims,
      freshness: docStatus.freshness,
      oldest_verified_at: docStatus.oldestVerifiedAt,
      freshness_window_days: docStatus.freshnessWindowDays,
      stale_claims: staleClaims.map((claim) => ({
        claim_id: claim.claim_id,
        field_path: claim.field_path,
        last_verified_at: claim.checked_date,
        reason_if_not_citable: claim.reason_if_not_citable,
      })),
      freshness_policy: {
        update_frequency: docStatus.freshnessPolicy.updateFrequency,
        risk_tier: docStatus.freshnessPolicy.riskTier,
        disclaimer_type: docStatus.freshnessPolicy.disclaimerType,
        reason: docStatus.freshnessPolicy.reason,
      },
      freshness_description: `Freshness is ${docStatus.freshness}; TTL is ${docStatus.freshnessWindowDays} days based on ${docStatus.freshnessPolicy.reason}.`,
      warning: excludedClaims.length > 0 || staleClaims.length > 0
        ? "Only claims with can_cite=true are included in copy-ready citation text. Unverified, low-confidence, or stale claims are excluded."
        : null,
    },
    verified_claims: verifiedClaims,
    stale_claims: staleClaims,
    excluded_claims: excludedClaims,
    endpoints: {
      html: canonicalUrl,
      json: apiDocumentUrl(document.slug),
      markdown: rawMarkdownUrl(document.slug),
      cite: siteUrl(`/api/cite/${document.slug}`),
    },
    license: "forai-data-license-v0.1",
    normalized_citation: normalizedCitation,
  };

  return NextResponse.json(citation, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      "X-Citation-Status": docStatus.label,
    },
  });
}
