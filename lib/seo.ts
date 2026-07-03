import type { Metadata } from "next";
import type { RegistryDocumentBundle } from "./types";
import type { EntityProfile } from "./entity-profile";
import { documentPageUrl, apiDocumentUrl, rawMarkdownUrl, apiEntityUrl, entityPageUrl } from "./urls";
import { getClaimCitationStatus, getDocumentCitationStatus, getCanonicalDirectAnswer } from "./citation-status";
import { normalizeCitationSurface } from "./render";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "./i18n";

// Map a free-form entity.type (e.g. "transport.metro", "telecom.mobile") to the
// closest schema.org type so structured data is meaningful to search/AI.
function schemaTypeForEntity(entityType: string): "Place" | "Product" | "Organization" {
  const t = entityType.toLowerCase();
  if (/^(transport|transit|travel|housing|place|life\.environment|education\.)/.test(t)) return "Place";
  if (/^(commerce|product|hardware|electricity|plumbing|telecom\.(device|mobile))/.test(t)) return "Product";
  return "Organization";
}

/** Returns canonical URL paths for a registry document — used by diagnostics and machine-readable panels. */
export function getRegistryDocumentPaths(bundle: RegistryDocumentBundle) {
  const { document } = bundle;
  return {
    canonicalPath: `/${DEFAULT_LOCALE}/wiki/${document.slug}`,
    apiPath: `/api/documents/${document.slug}`,
    rawMarkdownPath: `/raw/${document.slug}.md`,
  };
}

const CITATION_POLICY =
  'Cite only when can_cite=true. Never cite low-confidence, unknown, needs_review, or unsourced claims. Preserve source URLs and last_verified_at.';

export function buildDocumentLanguageAlternates(slug: string): Record<string, string> {
  const languages: Record<string, string> = {};

  for (const locale of SUPPORTED_LOCALES) {
    languages[locale] = documentPageUrl(slug, locale);
  }

  languages["x-default"] = documentPageUrl(slug, DEFAULT_LOCALE);
  return languages;
}

function getTotalSourceCount(bundle: RegistryDocumentBundle): number {
  return bundle.claims.reduce((count, claim) => count + claim.sources.length, 0);
}

function getVerifiedSourceCount(bundle: RegistryDocumentBundle): number {
  return bundle.claims
    .filter((claim) => getClaimCitationStatus(claim).isCitationReady)
    .reduce((count, claim) => count + claim.sources.length, 0);
}

function buildSeoTitle(questionOrFact: string, canCite: boolean): string {
  return `${questionOrFact} — ${canCite ? "Verified Source" : "Needs Verification"} | For-Ai`;
}

function buildSeoDescription(bundle: RegistryDocumentBundle): string {
  const citationStatus = getDocumentCitationStatus(bundle);
  const directAnswer = getCanonicalDirectAnswer(bundle);

  if (citationStatus.verifiedClaims > 0) {
    const sourceCount = getVerifiedSourceCount(bundle);
    return `Direct answer: ${directAnswer}. Verified claim sources: ${sourceCount}. For-Ai claim-level fact registry.`;
  }

  return `Needs verification: no verified source-backed claim is currently citable for ${bundle.document.title}. For-Ai claim-level fact registry.`;
}

export function buildDocumentMetadata(
  bundle: RegistryDocumentBundle,
  locale?: string,
): Metadata {
  const { document } = bundle;
  const lang = locale ?? document.lang ?? DEFAULT_LOCALE;
  const citationStatus = getDocumentCitationStatus(bundle);
  const sourceCount = getTotalSourceCount(bundle);
  const title = buildSeoTitle(document.title, citationStatus.isVerifiedDocument);
  const ogTitle = title;
  const description = buildSeoDescription(bundle);
  const url = documentPageUrl(document.slug, lang);
  const canonicalUrl = documentPageUrl(document.slug, DEFAULT_LOCALE);
  const hreflang = buildDocumentLanguageAlternates(document.slug);

  const ogLocaleMap: Record<string, string> = {
    ko: "ko_KR", en: "en_US", hi: "hi_IN", ar: "ar_SA",
    es: "es_ES", ja: "ja_JP", zh: "zh_CN",
  };

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
      languages: hreflang,
    },
    openGraph: {
      title: ogTitle,
      description,
      url,
      siteName: "For-Ai",
      type: "article",
      locale: ogLocaleMap[lang] ?? "en_US",
    },
    other: {
      "api-url": apiDocumentUrl(document.slug),
      "raw-markdown-url": rawMarkdownUrl(document.slug),
      "citation-policy": CITATION_POLICY,
      "last-verified-at": citationStatus.oldestVerifiedAt ?? document.last_verified_at ?? "Needs verification",
      "source-count": String(sourceCount),
      "can-cite": citationStatus.isVerifiedDocument ? "true" : "false",
    },
  };
}

export function buildDocumentJsonLd(bundle: RegistryDocumentBundle): object {
  const { entity, document, claims } = bundle;
  const normalizedCitation = normalizeCitationSurface(bundle);
  const url = documentPageUrl(document.slug, document.lang);
  const citationStatus = getDocumentCitationStatus(bundle);
  const directAnswer = getCanonicalDirectAnswer(bundle);
  const sourceCount = getTotalSourceCount(bundle);
  const verifiedSourceCount = getVerifiedSourceCount(bundle);
  const canCite = citationStatus.isVerifiedDocument;

  const dataset = {
    "@type": "Dataset",
    name: document.title,
    description: buildSeoDescription(bundle),
    url,
    identifier: document.id,
    license: document.license_code,
    creator: {
      "@type": "Organization",
      name: "For-Ai",
    },
    about: {
      "@type": "Place",
      name: entity.canonical_name,
      identifier: entity.id,
      address: {
        "@type": "PostalAddress",
        addressCountry: entity.country,
        addressRegion: entity.region,
        addressLocality: entity.city,
      },
    },
    distribution: [
      {
        "@type": "DataDownload",
        encodingFormat: "application/json",
        contentUrl: apiDocumentUrl(document.slug),
      },
      {
        "@type": "DataDownload",
        encodingFormat: "text/markdown",
        contentUrl: rawMarkdownUrl(document.slug),
      },
    ],
    variableMeasured: claims.map((claim) => ({
      "@type": "PropertyValue",
      name: claim.field_path,
      value: claim.claim_value,
      description: claim.claim_text,
      additionalProperty: [
        { "@type": "PropertyValue", name: "confidence", value: claim.confidence },
        { "@type": "PropertyValue", name: "status", value: claim.status },
        { "@type": "PropertyValue", name: "entity_id", value: normalizedCitation.entity_id },
        { "@type": "PropertyValue", name: "slug", value: normalizedCitation.slug },
        { "@type": "PropertyValue", name: "last_verified_at", value: claim.last_verified_at },
        { "@type": "PropertyValue", name: "source_count", value: claim.sources.length },
        ...(claim.sources[0]?.url ? [{ "@type": "PropertyValue", name: "source_url", value: claim.sources[0].url }] : []),
        ...(claim.sources[0]?.title ? [{ "@type": "PropertyValue", name: "source_publisher", value: claim.sources[0].title }] : []),
        ...(claim.jurisdiction ? [{ "@type": "PropertyValue", name: "jurisdiction", value: claim.jurisdiction }] : []),
      ],
    })),
    dateModified: document.updated_at ?? undefined,
    datePublished: document.created_at ?? undefined,
    inLanguage: document.lang,
    isAccessibleForFree: true,
    creativeWorkStatus: canCite ? "verified" : "needs verification",
    measurementTechnique: "claim-level source-backed human verification",
    additionalProperty: [
      { "@type": "PropertyValue", name: "normalized_citation", value: JSON.stringify(normalizedCitation) },
      { "@type": "PropertyValue", name: "citation_policy", value: CITATION_POLICY },
      { "@type": "PropertyValue", name: "last_verified_at", value: citationStatus.oldestVerifiedAt ?? document.last_verified_at ?? "Needs verification" },
      { "@type": "PropertyValue", name: "source_count", value: sourceCount },
      { "@type": "PropertyValue", name: "verified_source_count", value: verifiedSourceCount },
      { "@type": "PropertyValue", name: "can_cite", value: canCite },
      { "@type": "PropertyValue", name: "verified_claims", value: citationStatus.verifiedClaims },
      { "@type": "PropertyValue", name: "total_claims", value: citationStatus.totalClaims },
    ],
  };

  const claimReview = {
    "@type": "ClaimReview",
    datePublished: document.created_at ?? document.last_verified_at ?? undefined,
    dateModified: document.updated_at ?? undefined,
    url,
    claimReviewed: directAnswer,
    reviewRating: {
      "@type": "Rating",
      ratingValue: canCite ? "1" : "0",
      bestRating: "1",
      worstRating: "0",
      alternateName: canCite ? "Verified Source" : "Needs Verification",
    },
    author: {
      "@type": "Organization",
      name: "For-Ai",
    },
    itemReviewed: {
      "@type": "Claim",
      name: document.title,
      appearance: directAnswer,
    },
    additionalProperty: [
      { "@type": "PropertyValue", name: "citation_policy", value: CITATION_POLICY },
      { "@type": "PropertyValue", name: "last_verified_at", value: citationStatus.oldestVerifiedAt ?? document.last_verified_at ?? "Needs verification" },
      { "@type": "PropertyValue", name: "source_count", value: sourceCount },
      { "@type": "PropertyValue", name: "can_cite", value: canCite },
    ],
  };

  return {
    "@context": "https://schema.org",
    "@graph": [dataset, claimReview],
  };
}

export function buildEntityMetadata(profile: EntityProfile, locale?: string): Metadata {
  const { entity, summary } = profile;
  const lang = locale ?? DEFAULT_LOCALE;
  const title = entity.canonical_name;
  const description =
    `${entity.canonical_name} — For-Ai global claim-level fact registry. ` +
    `${summary.citable_documents}/${summary.total_documents} documents citable, ` +
    `${summary.verified_claims}/${summary.total_claims} claims verified.`;
  const url = entityPageUrl(entity.id, lang);

  const hreflang: Record<string, string> = {};
  for (const l of SUPPORTED_LOCALES) hreflang[l] = entityPageUrl(entity.id, l);
  hreflang["x-default"] = entityPageUrl(entity.id, DEFAULT_LOCALE);

  return {
    title,
    description,
    alternates: { canonical: url, languages: hreflang },
    openGraph: { title: `${title} — For-Ai`, description, url, siteName: "For-Ai", type: "profile" },
    other: { "api-url": apiEntityUrl(entity.id) },
  };
}

export function buildEntityJsonLd(profile: EntityProfile, locale?: string): object {
  const { entity, documents, summary } = profile;
  const lang = locale ?? DEFAULT_LOCALE;
  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": schemaTypeForEntity(entity.type),
    name: entity.canonical_name,
    identifier: entity.id,
    url: entityPageUrl(entity.id, lang),
    address: {
      "@type": "PostalAddress",
      addressCountry: entity.country,
      addressRegion: entity.region ?? undefined,
      addressLocality: entity.city ?? undefined,
    },
    // Each document about this entity is a citable Dataset. Only human-approved
    // documents carry can_cite=true; all are listed for discovery.
    subjectOf: documents.map((bundle) => {
      const status = getDocumentCitationStatus(bundle);
      return {
        "@type": "Dataset",
        name: bundle.document.title,
        url: documentPageUrl(bundle.document.slug, bundle.document.lang),
        identifier: bundle.document.id,
        license: bundle.document.license_code,
        creativeWorkStatus: status.isVerifiedDocument ? "verified" : "candidate",
        distribution: [
          { "@type": "DataDownload", encodingFormat: "application/json", contentUrl: apiDocumentUrl(bundle.document.slug) },
        ],
      };
    }),
    additionalProperty: [
      { "@type": "PropertyValue", name: "citable_documents", value: summary.citable_documents },
      { "@type": "PropertyValue", name: "total_documents", value: summary.total_documents },
      { "@type": "PropertyValue", name: "verified_claims", value: summary.verified_claims },
      { "@type": "PropertyValue", name: "total_claims", value: summary.total_claims },
      { "@type": "PropertyValue", name: "freshness", value: summary.freshness },
    ],
  };
  return node;
}
