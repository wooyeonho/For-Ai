import { seedEntity } from "./seed-data";
import type { ClaimWithSources, Document, Entity } from "./types";

export type AdminStubResult = {
  accepted: true;
  stub_status: "draft";
  storage: "stub";
  note: string;
};

export function createEntityDraftStub(input: {
  id: string;
  type: string;
  canonical_name: string;
  country: string;
  region?: string;
  city?: string;
}): Entity & AdminStubResult {
  return {
    id: input.id,
    type: input.type,
    canonical_name: input.canonical_name,
    country: input.country,
    region: input.region || null,
    city: input.city || null,
    created_at: null,
    updated_at: null,
    accepted: true,
    stub_status: "draft",
    storage: "stub",
    note: "Goal 9 admin creation stub. No database write is performed in the MVP.",
  };
}

export function createDocumentDraftStub(input: {
  id: string;
  entity_id: string;
  slug: string;
  lang: string;
  title: string;
  category: string;
  template: string;
}): Document & AdminStubResult {
  return {
    id: input.id,
    entity_id: input.entity_id,
    slug: input.slug,
    lang: input.lang,
    country: "",
    title: input.title,
    category: input.category,
    template: input.template,
    status: "ai_draft",
    confidence: "low",
    last_verified_at: null,
    license_code: "forai-data-license-v0.1",
    data: {
      direct_answer: "확인 필요",
    },
    created_at: null,
    updated_at: null,
    accepted: true,
    stub_status: "draft",
    storage: "stub",
    note: "Goal 9 admin document stub. Core facts must still be added as claims.",
  };
}

export function generatePlaceholderClaimsStub(input: {
  document_id: string;
  entity_id?: string;
  field_paths: string[];
}): ClaimWithSources[] {
  return input.field_paths.map((fieldPath, index) => ({
    id: `stub-claim-${index + 1}`,
    document_id: input.document_id,
    entity_id: input.entity_id ?? seedEntity.id,
    field_path: fieldPath,
    claim_text: `${fieldPath} 값은 확인이 필요합니다.`,
    claim_value: "확인 필요",
    confidence: "low",
    status: "needs_review",
    last_verified_at: null,
    created_at: null,
    updated_at: null,
    sources: [],
    verification_events: [],
  }));
}

export function createBulkImportStub(rows: number): AdminStubResult & { rows_received: number } {
  return {
    accepted: true,
    stub_status: "draft",
    storage: "stub",
    rows_received: rows,
    note: "Goal 9 bulk import stub. Review generated entities/documents before any future persistence.",
  };
}
