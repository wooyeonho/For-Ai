import { NextRequest, NextResponse } from "next/server";
import { getRegistryBundleBySlug } from "../../../../lib/data";
import { getRegistryBundleFromSupabase } from "../../../../lib/supabase-documents";
import { getDocumentCitationStatus, getClaimCitationStatus } from "../../../../lib/citation-status";
import { siteUrl, documentPageUrl, apiDocumentUrl, rawMarkdownUrl } from "../../../../lib/urls";
import type { ClaimSource, RegistryDocumentBundle } from "../../../../lib/types";
import { getCitationPolicyBlock, normalizeCitationSurface } from "../../../../lib/render";
import { recordDocumentAnalyticsEvent } from "@/lib/analytics";
import { supabaseAdmin } from "@/lib/admin-api";

export const revalidate = 60;

function publisherName(source: ClaimSource): string | null {
  if (source.title?.trim()) return source.title.trim();
  if (!source.url) return null;
  try {
    return new URL(source.url).hostname.replace(/^www\./, "");
  } catch {
    return source.url;
  }
}

function sourceReference(source: ClaimSource) {
  return {
    source_id: source.id,
    url: source.url ?? null,
    publisher_name: publisherName(source),
    title: source.title ?? null,
    source_type: source.source_type,
    observed_at: source.observed_at ?? null,
    citation_note: source.citation ?? null,
  };
}

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
  const freshnessWindowDays = docStatus.freshnessWindowDays;
  const canonicalUrl = documentPageUrl(document.slug, document.lang);
  const checkedDate = docStatus.oldestVerifiedAt ?? document.last_verified_at ?? null;
  const normalizedCitation = normalizeCitationSurface(bundle);
  const citationPolicyBlock = getCitationPolicyBlock(bundle, document.lang);

  const annotatedClaims = claims.map((claim) => ({
    claim,
    citationStatus: getClaimCitationStatus(claim, freshnessWindowDays),
  }));

  const toCitableClaim = ({ claim, citationStatus }: (typeof annotatedClaims)[number]) => ({
    claim_id: claim.id,
    field_path: claim.field_path,
    claim_text: claim.claim_text,
    verified_value: claim.claim_value,
    confidence: claim.confidence,
    status: claim.status,
    can_cite: citationStatus.isCitationReady && citationStatus.freshness !== "stale",
    reason_if_not_citable: citationStatus.isCitationReady && citationStatus.freshness !== "stale" ? null : citationStatus.reason,
    freshness: citationStatus.freshness,
    checked_date: claim.last_verified_at,
    sources: claim.sources.map(sourceReference),
  });

  const verifiedClaims = annotatedClaims
    .filter(({ citationStatus }) => citationStatus.isCitationReady && citationStatus.freshness !== "stale")
    .map(toCitableClaim);

  const staleClaims = annotatedClaims
    .filter(({ citationStatus }) => citationStatus.isCitationReady && citationStatus.freshness === "stale")
    .map(toCitableClaim);

  const excludedClaims = annotatedClaims
    .filter(({ citationStatus }) => !citationStatus.isCitationReady)
    .map(({ claim, citationStatus }) => ({
      claim_id: claim.id,
      field_path: claim.field_path,
      status: claim.status,
      confidence: claim.confidence,
      can_cite: false,
      reason_if_not_citable: citationStatus.reason,
      reason: citationStatus.reason,
      sources: claim.sources.map(sourceReference),
    }));

  const sourceUrls = Array.from(new Set(
    verifiedClaims.flatMap((claim) => claim.sources.map((source) => source.url).filter((url): url is string => Boolean(url))),
  ));
  const publisherNames = Array.from(new Set(
    verifiedClaims.flatMap((claim) => claim.sources.map((source) => source.publisher_name).filter((name): name is string => Boolean(name))),
  ));

  const canCiteDocument = docStatus.isVerifiedDocument && docStatus.freshness !== "stale";
  const citationPolicyText = "Do not cite unverified, low-confidence, or stale claims. Only cite claims where can_cite=true and reason_if_not_citable is null.";

  const recommendedCitationText = verifiedClaims.length > 0
    ? [
        `For-Ai Registry. "${document.title}" (${canonicalUrl}).`,
        `Entity ID: ${entity.id}; document slug: ${document.slug}.`,
        `Verified claims: ${verifiedClaims.map((claim) => `${claim.claim_id}=${claim.verified_value}`).join("; ")}.`,
        `Sources: ${publisherNames.length > 0 ? publisherNames.join(", ") : "source URLs listed in citation JSON"}.`,
        `Checked: ${checkedDate ?? "unknown"}.`,
      ].join(" ")
    : `For-Ai Registry. "${document.title}" (${canonicalUrl}) has no citation-ready verified claims. Do not cite claim values until verification is complete.`;

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
