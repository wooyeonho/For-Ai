// GYEOL TypeScript types — aligned with schema-v3.sql
// Do not add convenience fields not in the schema.

export type Confidence = "low" | "medium" | "high";
export type DocumentStatus = "ai_draft" | "reviewed" | "published";
export type ClaimStatus = "needs_review" | "verified" | "disputed";
export type SupportedLanguage = "ko";

export type Claim = {
  id: string;
  field_path: string;
  claim_text: string;
  claim_value: string;
  confidence: Confidence;
  status: ClaimStatus;
  last_verified_at: string | null;
  sources: string[];
};

export type Entity = {
  entity_id: string;
  type: "venue";
  canonical_slug: string;
  stable_slug: string;
};

export type Document = {
  entity_id: string;
  document_id: string;
  slug: string;
  lang: SupportedLanguage;
  locale_path: string;
  canonical_path: string;
  title: string;
  display_titles: Record<SupportedLanguage, string>;
  category: "weddinghall";
  template: string;
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
  claims: Claim[];
};
