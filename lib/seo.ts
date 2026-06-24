import type { Metadata } from "next";
import type { RegistryDocumentBundle } from "./types";
import { documentPageUrl, apiDocumentUrl, rawMarkdownUrl } from "./urls";
import { getDocumentCitationStatus, getCanonicalDirectAnswer } from "./citation-status";
import { SUPPORTED_LOCALES } from "./i18n";

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
  const lang = locale ?? document.lang ?? "ko";
  const title = document.title;
  const ogTitle = `${document.title} — GYEOL`;
  const description = `${entity.canonical_name} ${document.template} 정보. 신뢰도: ${document.confidence}. GYEOL claim registry.`;
  const url = documentPageUrl(document.slug, lang);

  const hreflang: Record<string, string> = {};
  for (const l of SUPPORTED_LOCALES) {
    hreflang[l] = `https://gyeol.com/${l}/wiki/${document.slug}`;
  }
  hreflang["x-default"] = `https://gyeol.com/ko/wiki/${document.slug}`;

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
      siteName: "GYEOL",
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
      name: "GYEOL",
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
      name: "GYEOL",
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
