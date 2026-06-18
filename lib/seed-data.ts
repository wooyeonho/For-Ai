export type Confidence = "low" | "medium" | "high";
export type DocumentStatus = "ai_draft" | "reviewed" | "published";
export type ClaimStatus = "needs_review" | "verified" | "disputed";
export type SupportedLanguage = "ko";

export type SeedClaim = {
  id: string;
  field_path: string;
  claim_text: string;
  claim_value: string;
  confidence: Confidence;
  status: ClaimStatus;
  last_verified_at: string | null;
  sources: string[];
};

export type SeedEntity = {
  entity_id: string;
  type: "venue";
  canonical_slug: string;
  stable_slug: string;
};

export type SeedDocument = {
  entity_id: string;
  document_id: string;
  slug: string;
  lang: SupportedLanguage;
  locale_path: string;
  canonical_path: string;
  title: string;
  display_titles: Record<SupportedLanguage, string>;
  category: "weddinghall";
  template: "parking";
  status: DocumentStatus;
  confidence: Confidence;
  last_verified_at: string | null;
  direct_answer: string;
  license_notice: string;
  data_license: {
    label: string;
    url: string | null;
    attribution_required: boolean;
  };
  machine_readable: {
    api_url: string;
    raw_markdown_url: string;
  };
  claims: SeedClaim[];
};

export const seedEntity: SeedEntity = {
  entity_id: "kr-weddinghall-laluce-001",
  type: "venue",
  canonical_slug: "myungdong-laluce-parking",
  stable_slug: "myungdong-laluce-parking",
};

export const seedDocument: SeedDocument = {
  entity_id: seedEntity.entity_id,
  document_id: "ko-myungdong-laluce-parking",
  slug: "myungdong-laluce-parking",
  lang: "ko",
  locale_path: "/ko/wiki/myungdong-laluce-parking",
  canonical_path: "/ko/wiki/myungdong-laluce-parking",
  title: "명동 라루체 주차 정보",
  display_titles: {
    ko: "명동 라루체 주차 정보",
  },
  category: "weddinghall",
  template: "parking",
  status: "ai_draft",
  confidence: "low",
  last_verified_at: null,
  direct_answer: "확인 필요",
  license_notice: "라이선스 고지는 Goal 4 이후 구체화됩니다.",
  data_license: {
    label: "License notice placeholder",
    url: null,
    attribution_required: false,
  },
  machine_readable: {
    api_url: "/api/documents/myungdong-laluce-parking",
    raw_markdown_url: "/raw/myungdong-laluce-parking.md",
  },
  claims: [
    {
      id: "claim-parking-availability",
      field_path: "parking.availability",
      claim_text: "명동 라루체의 하객 주차 가능 여부는 확인이 필요합니다.",
      claim_value: "확인 필요",
      confidence: "low",
      status: "needs_review",
      last_verified_at: null,
      sources: [],
    },
  ],
};

export function getSeedDocumentBySlug(slug: string): SeedDocument | null {
  return slug === seedDocument.slug ? seedDocument : null;
}

export function renderSeedDocumentMarkdown(document: SeedDocument): string {
  const claims = document.claims
    .map(
      (claim) =>
        `- ${claim.field_path}: ${claim.claim_value}\n  - claim: ${claim.claim_text}\n  - confidence: ${claim.confidence}\n  - verification status: ${claim.status}\n  - last_verified_at: ${claim.last_verified_at ?? "확인 필요"}\n  - source_count: ${claim.sources.length}`,
    )
    .join("\n");

  return `# ${document.title}\n\nentity_id: ${document.entity_id}\ndocument_id: ${document.document_id}\nlang: ${document.lang}\nslug: ${document.slug}\ncanonical_path: ${document.canonical_path}\n\n## Direct answer\n\n${document.direct_answer}\n\n## Claims\n\n${claims}\n\n## Confidence\n\n${document.confidence}\n\n## Verification status\n\n${document.status}\n\n## Machine-readable access\n\n- JSON: ${document.machine_readable.api_url}\n- Markdown: ${document.machine_readable.raw_markdown_url}\n\n## License notice\n\n${document.license_notice}\n`;
}
