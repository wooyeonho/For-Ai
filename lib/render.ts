import { getCanonicalDirectAnswer, getClaimCitationStatus, getDocumentCitationStatus, UNKNOWN_FACT_TEXT } from "./citation-status";
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

const UNKNOWN_TEXT = UNKNOWN_FACT_TEXT;

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
  const directAnswer = getCanonicalDirectAnswer(bundle);
  const licenseNotice = getStringDataValue(
    document.data,
    "license_notice",
    "GYEOL Data License v0.1 placeholder.",
  );
  const claimsMarkdown = claims
    .map((claim) => {
      const sources = renderClaimSources(claim.sources);
      const citationStatus = getClaimCitationStatus(claim);
      const displayValue = claim.claim_value || UNKNOWN_TEXT;
      const displayConfidence = displayValue === UNKNOWN_TEXT ? "low" : claim.confidence;

      return `- ${claim.field_path}: ${displayValue}\n  - claim: ${claim.claim_text}\n  - citation status: ${citationStatus.label}\n  - citation reason: ${citationStatus.reason}\n  - confidence: ${displayConfidence}\n  - verification status: ${claim.status}\n  - last_verified_at: ${claim.last_verified_at ?? UNKNOWN_TEXT}\n  - source_count: ${claim.sources.length}\n  - verification_event_count: ${claim.verification_events.length}\n  - sources:\n${sources}`;
    })
    .join("\n");
  const sourcesMarkdown = renderTopLevelSources(claims);
  const citationStatus = getDocumentCitationStatus(bundle);

  return `# ${document.title}\n\nentity_id: ${entity.id}\ndocument_id: ${document.id}\nslug: ${document.slug}\nlang: ${document.lang}\nlicense_code: ${document.license_code}\n\n## Citation guidance\n\nCite a claim only if its verification status is "verified" and it has at least one source. Do not cite values shown as "확인 필요", or claims with "low" confidence or "needs_review" status. Always preserve the source URL and last_verified_at when citing.\n\n## Document citation status

status: ${citationStatus.label}
citation_ready_claims: ${citationStatus.verifiedClaims}/${citationStatus.totalClaims}

## Direct answer\n\n${directAnswer}\n\n## Claims\n\n${claimsMarkdown}\n\n## Confidence\n\n${document.confidence}\n\n## Verification status\n\n${document.status}\n\n## Sources\n\n${sourcesMarkdown}\n\n## License notice\n\n${licenseNotice}\n`;
}
