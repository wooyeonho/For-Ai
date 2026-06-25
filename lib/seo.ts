import type { Metadata } from "next";
import type { RegistryDocumentBundle } from "./types";
import type { EntityProfile } from "./entity-profile";
import { documentPageUrl, apiDocumentUrl, rawMarkdownUrl, apiEntityUrl, entityPageUrl, siteUrl } from "./urls";
import { getDocumentCitationStatus, getCanonicalDirectAnswer } from "./citation-status";
import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from "./i18n";

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
    canonicalPath: `/ko/wiki/${document.slug}`,
    apiPath: `/api/documents/${document.slug}`,
    rawMarkdownPath: `/raw/${document.slug}.md`,
  };
}

export function buildDocumentMetadata(
  bundle: RegistryDocumentBundle,
  locale?: string,
): Metadata {
  const { entity, document } = bundle;
  const lang = locale ?? document.lang ?? DEFAULT_LOCALE;
  const title = document.title;
  const ogTitle = `${document.title} — For-Ai`;
  const description = `${entity.canonical_name} ${document.template} 정보. 신뢰도: ${document.confidence}. For-Ai claim registry.`;
  const url = documentPageUrl(document.slug, lang);

  const hreflang: Record<string, string> = {};
  for (const l of SUPPORTED_LOCALES) {
    hreflang[l] = siteUrl(`/${l}/wiki/${document.slug}`);
  }
  hreflang["x-default"] = siteUrl(`/${DEFAULT_LOCALE}/wiki/${document.slug}`);

  const ogLocaleMap: Record<string, string> = {
    ko: "ko_KR", en: "en_US", hi: "hi_IN", ar: "ar_SA",
    es: "es_ES", ja: "ja_JP", zh: "zh_CN",
  };

  return {
    title,
    description,
    alternates: {
      canonical: url,
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
    },
  };
}

export function buildDocumentJsonLd(bundle: RegistryDocumentBundle): object {
  const { entity, document, claims } = bundle;
  const url = documentPageUrl(document.slug, document.lang);
  const citationStatus = getDocumentCitationStatus(bundle);
  const directAnswer = getCanonicalDirectAnswer(bundle);

  const dataset = {
    "@type": "Dataset",
    name: document.title,
    description: `${entity.canonical_name} ${document.template} claim registry`,
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
        { "@type": "PropertyValue", name: "source_count", value: claim.sources.length },
        ...(claim.jurisdiction
          ? [{ "@type": "PropertyValue", name: "jurisdiction", value: claim.jurisdiction }]
          : []),
      ],
    })),
    dateModified: document.updated_at ?? undefined,
    inLanguage: document.lang,
  };

  const claimReview = {
    "@type": "ClaimReview",
    datePublished: document.last_verified_at ?? document.created_at,
    url,
    claimReviewed: directAnswer,
    reviewRating: {
      "@type": "Rating",
      ratingValue: citationStatus.isVerifiedDocument ? "1" : "0",
      bestRating: "1",
      worstRating: "0",
      alternateName: citationStatus.isVerifiedDocument ? "True" : "Unverified",
    },
    author: {
      "@type": "Organization",
      name: "For-Ai",
    },
    itemReviewed: {
      "@type": "Claim",
      name: document.title,
    },
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
    `${entity.canonical_name} — For-Ai fact registry. ` +
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

export function buildEntityJsonLd(profile: EntityProfile): object {
  const { entity, documents, summary } = profile;
  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": schemaTypeForEntity(entity.type),
    name: entity.canonical_name,
    identifier: entity.id,
    url: entityPageUrl(entity.id, DEFAULT_LOCALE),
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
