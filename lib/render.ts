// GYEOL rendering helpers
// renderDocumentJson  — for /api/documents/[slug] (JSON API)
// renderDocumentMarkdown — for /raw/[...path] (machine-readable markdown)

import type { Document } from "./types";
import type { RegistryBundle } from "./data";

export function renderDocumentJson(bundle: RegistryBundle): Record<string, unknown> {
  const { entity, document } = bundle;
  return {
    entity_id: entity.entity_id,
    entity_type: entity.type,
    document_id: document.document_id,
    slug: document.slug,
    lang: document.lang,
    locale_path: document.locale_path,
    canonical_path: document.canonical_path,
    title: document.title,
    display_titles: document.display_titles,
    category: document.category,
    template: document.template,
    status: document.status,
    confidence: document.confidence,
    last_verified_at: document.last_verified_at,
    direct_answer: document.direct_answer,
    claims: document.claims.map((c) => ({
      id: c.id,
      field_path: c.field_path,
      claim_text: c.claim_text,
      claim_value: c.claim_value,
      confidence: c.confidence,
      status: c.status,
      last_verified_at: c.last_verified_at,
      source_count: c.sources.length,
    })),
    machine_readable: document.machine_readable,
    license_notice: document.license_notice,
    data_license: document.data_license,
  };
}

export function renderDocumentMarkdown(document: Document): string {
  const claims = document.claims
    .map(
      (claim) =>
        `- ${claim.field_path}: ${claim.claim_value}\n` +
        `  - claim: ${claim.claim_text}\n` +
        `  - confidence: ${claim.confidence}\n` +
        `  - verification_status: ${claim.status}\n` +
        `  - last_verified_at: ${claim.last_verified_at ?? "확인 필요"}\n` +
        `  - source_count: ${claim.sources.length}`,
    )
    .join("\n");

  return (
    `# ${document.title}\n\n` +
    `entity_id: ${document.entity_id}\n` +
    `document_id: ${document.document_id}\n` +
    `lang: ${document.lang}\n` +
    `slug: ${document.slug}\n` +
    `canonical_path: ${document.canonical_path}\n\n` +
    `## Direct answer\n\n${document.direct_answer}\n\n` +
    `## Claims\n\n${claims}\n\n` +
    `## Confidence\n\n${document.confidence}\n\n` +
    `## Verification status\n\n${document.status}\n\n` +
    `## Machine-readable access\n\n` +
    `- JSON: ${document.machine_readable.api_url}\n` +
    `- Markdown: ${document.machine_readable.raw_markdown_url}\n\n` +
    `## License notice\n\n${document.license_notice}\n`
  );
}
