import type { Metadata } from "next";
import type { RegistryDocumentBundle } from "./types";
import { documentPageUrl, apiDocumentUrl, rawMarkdownUrl } from "./urls";

export function buildDocumentMetadata(bundle: RegistryDocumentBundle): Metadata {
  const { entity, document } = bundle;
  const title = document.title;
  const ogTitle = `${document.title} â GYEOL`;
  const description = `${entity.canonical_name} ${document.template} ì ë³´. ì ë¢°ë: ${document.confidence}. GYEOL claim registry.`;
  const url = documentPageUrl(document.slug, document.lang);

  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: {
        ko: url,
      },
    },
    openGraph: {
      title: ogTitle,
      description,
      url,
      siteName: "GYEOL",
      type: "article",
      locale: "ko_KR",
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

  return {
    "@context": "https://schema.org",
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
    })),
    dateModified: document.updated_at ?? undefined,
    inLanguage: document.lang,
  };
}

export function getRegistryDocumentPaths(bundle: RegistryDocumentBundle): {
  canonicalPath: string;
  apiPath: string;
  rawMarkdownPath: string;
} {
  const { document } = bundle;
  return {
    canonicalPath: `/ko/wiki/${document.slug}`,
    apiPath: `/api/document/${document.slug}`,
    rawMarkdownPath: `/api/document/${document.slug}/raw`,
  };
}
