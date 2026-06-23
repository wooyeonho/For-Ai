import type { ClaimSource, RegistryDocumentBundle } from "./types";
import { apiDocumentUrl, documentPageUrl, rawMarkdownUrl } from "./urls";

export type RenderedDocumentJson = {
  entity: RegistryDocumentBundle["entity"];
  document: RegistryDocumentBundle["document"];
  claims: RegistryDocumentBundle["claims"];
  listing: RegistryDocumentBundle["listing"];
  machine_readable: {
    canonical_url: string;
    json_url: string;
    raw_markdown_url: string;
  };
  update_status: {
    last_verified_at: string;
    updated_at: string;
    rule: string;
  };
};

const UNKNOWN_TEXT = "확인 필요";

function getStringDataValue(data: Record<string, unknown>, key: string, fallback: string): string {
  const value = data[key];
  return typeof value === "string" ? value : fallback;
}

function renderSourceLabel(source: ClaimSource): string {
  return `${source.source_type}: ${source.title ?? source.url ?? source.citation ?? "unknown"}`;
}

function renderClaimSources(sources: ClaimSource[]): string {
  if (sources.length === 0) {
    return "    - none";
  }

  return sources.map((source) => `    - ${renderSourceLabel(source)}`).join("\n");
}

function renderTopLevelSources(claims: RegistryDocumentBundle["claims"]): string {
  const sources = claims.flatMap((claim) => claim.sources.map((source) => ({ claim, source })));

  if (sources.length === 0) {
    return "No sources are currently attached to the claims.";
  }

  return sources
    .map(({ claim, source }) => `- ${claim.field_path}: ${renderSourceLabel(source)}`)
    .join("\n");
}

export function renderDocumentJson(bundle: RegistryDocumentBundle): RenderedDocumentJson {
  const { document } = bundle;

  return {
    entity: bundle.entity,
    document,
    claims: bundle.claims,
    listing: bundle.listing,
    machine_readable: {
      canonical_url: documentPageUrl(document.slug, document.lang),
      json_url: apiDocumentUrl(document.slug),
      raw_markdown_url: rawMarkdownUrl(document.slug),
    },
    update_status: {
      last_verified_at: document.last_verified_at ?? UNKNOWN_TEXT,
      updated_at: document.updated_at ?? UNKNOWN_TEXT,
      rule: "Unsourced or unknown facts must remain 확인 필요 with low confidence.",
    },
  };
}

export function renderDocumentMarkdown(bundle: RegistryDocumentBundle): string {
  const { entity, document, claims } = bundle;
  const directAnswer = getStringDataValue(document.data, "direct_answer", UNKNOWN_TEXT);
  const licenseNotice = getStringDataValue(
    document.data,
    "license_notice",
    "GYEOL Data License v0.1 placeholder.",
  );
  const claimsMarkdown = claims
    .map((claim) => {
      const sources = renderClaimSources(claim.sources);

      return `- ${claim.field_path}: ${claim.claim_value}\n  - claim: ${claim.claim_text}\n  - confidence: ${claim.confidence}\n  - verification status: ${claim.status}\n  - last_verified_at: ${claim.last_verified_at ?? UNKNOWN_TEXT}\n  - sources:\n${sources}`;
    })
    .join("\n");
  const sourcesMarkdown = renderTopLevelSources(claims);

  return `# ${document.title}\n\nentity_id: ${entity.id}\ndocument_id: ${document.id}\nslug: ${document.slug}\nlang: ${document.lang}\nlicense_code: ${document.license_code}\n\n## Citation guidance\n\nCite the canonical document page when referencing this registry entry. Use claim confidence, verification status, and sources before treating any claim as factual. Unknown facts remain ${UNKNOWN_TEXT}.\n\n## Direct answer\n\n${directAnswer}\n\n## Claims\n\n${claimsMarkdown}\n\n## Confidence\n\n${document.confidence}\n\n## Verification status\n\n${document.status}\n\n## Sources\n\n${sourcesMarkdown}\n\n## License notice\n\n${licenseNotice}\n`;
}
