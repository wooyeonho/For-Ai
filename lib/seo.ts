import type { RegistryDocumentBundle } from "./types";
import { absoluteUrl } from "./urls";

function getStringDataValue(data: Record<string, unknown>, key: string, fallback: string): string {
  const value = data[key];
  return typeof value === "string" ? value : fallback;
}

function getMachineReadableUrl(data: Record<string, unknown>, key: "api_url" | "raw_markdown_url", fallback: string): string {
  const machineReadable = data.machine_readable;

  if (!machineReadable || typeof machineReadable !== "object") {
    return fallback;
  }

  const value = (machineReadable as Record<string, unknown>)[key];
  return typeof value === "string" ? value : fallback;
}

export function getRegistryDocumentPaths(bundle: RegistryDocumentBundle) {
  const { document } = bundle;
  const canonicalPath = getStringDataValue(document.data, "canonical_path", `/ko/wiki/${document.slug}`);
  const apiPath = getMachineReadableUrl(document.data, "api_url", `/api/documents/${document.slug}`);
  const rawMarkdownPath = getMachineReadableUrl(document.data, "raw_markdown_url", `/raw/${document.slug}.md`);

  return {
    canonicalPath,
    apiPath,
    rawMarkdownPath,
    canonicalUrl: absoluteUrl(canonicalPath),
    apiUrl: absoluteUrl(apiPath),
    rawMarkdownUrl: absoluteUrl(rawMarkdownPath),
  };
}

export function getRegistryDocumentDescription(bundle: RegistryDocumentBundle): string {
  const directAnswer = getStringDataValue(bundle.document.data, "direct_answer", "확인 필요");
  return `${bundle.document.title}: GYEOL claim-level fact registry document. Direct answer: ${directAnswer}. Confidence: ${bundle.document.confidence}.`;
}

export function renderRegistryDocumentJsonLd(bundle: RegistryDocumentBundle) {
  const { entity, document, claims } = bundle;
  const paths = getRegistryDocumentPaths(bundle);

  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: document.title,
    description: getRegistryDocumentDescription(bundle),
    url: paths.canonicalUrl,
    inLanguage: document.lang,
    license: document.license_code,
    identifier: document.id,
    isAccessibleForFree: true,
    publisher: {
      "@type": "Organization",
      name: "GYEOL",
      url: absoluteUrl("/"),
    },
    about: {
      "@type": "Place",
      identifier: entity.id,
      name: entity.canonical_name,
      address: {
        "@type": "PostalAddress",
        addressCountry: entity.country,
        addressRegion: entity.region ?? undefined,
        addressLocality: entity.city ?? undefined,
      },
    },
    distribution: [
      {
        "@type": "DataDownload",
        encodingFormat: "application/json",
        contentUrl: paths.apiUrl,
      },
      {
        "@type": "DataDownload",
        encodingFormat: "text/markdown",
        contentUrl: paths.rawMarkdownUrl,
      },
    ],
    variableMeasured: claims.map((claim) => ({
      "@type": "PropertyValue",
      propertyID: claim.field_path,
      name: claim.field_path,
      value: claim.claim_value,
      description: claim.claim_text,
      additionalProperty: [
        {
          "@type": "PropertyValue",
          name: "confidence",
          value: claim.confidence,
        },
        {
          "@type": "PropertyValue",
          name: "verification_status",
          value: claim.status,
        },
        {
          "@type": "PropertyValue",
          name: "source_count",
          value: claim.sources.length,
        },
        {
          "@type": "PropertyValue",
          name: "last_verified_at",
          value: claim.last_verified_at ?? "확인 필요",
        },
      ],
    })),
  };
}
