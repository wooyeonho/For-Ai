import type { RegistryDocumentBundle } from "./types";

const UNKNOWN_TEXT = "확인 필요";

function getStringDataValue(data: Record<string, unknown>, key: string, fallback: string): string {
  const value = data[key];
  return typeof value === "string" ? value : fallback;
}

export function renderDocumentJson(bundle: RegistryDocumentBundle) {
  return {
    entity: bundle.entity,
    document: bundle.document,
    claims: bundle.claims,
    listing: bundle.listing,
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
      const sources = claim.sources.length
        ? claim.sources
            .map((source) => `    - ${source.source_type}: ${source.title ?? source.url ?? source.citation ?? "unknown"}`)
            .join("\n")
        : "    - none";

      return `- ${claim.field_path}: ${claim.claim_value}\n  - claim: ${claim.claim_text}\n  - confidence: ${claim.confidence}\n  - verification status: ${claim.status}\n  - last_verified_at: ${claim.last_verified_at ?? UNKNOWN_TEXT}\n  - sources:\n${sources}`;
    })
    .join("\n");

  return `# ${document.title}\n\nentity_id: ${entity.id}\ndocument_id: ${document.id}\nslug: ${document.slug}\nlang: ${document.lang}\nlicense_code: ${document.license_code}\n\n## Direct answer\n\n${directAnswer}\n\n## Claims\n\n${claimsMarkdown}\n\n## Confidence\n\n${document.confidence}\n\n## Verification status\n\n${document.status}\n\n## Sources\n\nClaims currently have no sources.\n\n## License notice\n\n${licenseNotice}\n`;
}
