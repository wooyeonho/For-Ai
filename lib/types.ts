export type Confidence = "low" | "medium" | "high";
export type DocumentStatus = "ai_draft" | "needs_review" | "verified" | "published" | "archived";
export type ClaimStatus = "needs_review" | "verified" | "disputed" | "unknown";

export const transportFareFieldPaths = [
  "fare.base",
  "fare.airport",
  "fare.daily_cap",
  "fare.card_required",
  "transfer.rule",
  "payment.contactless",
  "children.discount",
  "last_updated_by_operator",
] as const;

export type TransportFareFieldPath = (typeof transportFareFieldPaths)[number];

export type SourceType =
  | "official"
  | "law"
  | "regulator"
  | "platform"
  | "review"
  | "user"
  | "phone"
  | "photo"
  | "document"
  | "web"
  | "other"
  | "unknown";
export type SubmissionStatus = "new" | "reviewing" | "accepted" | "rejected" | "spam";
export type VerificationEventType =
  | "created"
  | "reviewed"
  | "source_added"
  | "source_removed"
  | "source_verified"
  | "status_changed"
  | "confidence_changed";

export type Entity = {
  id: string;
  type: string;
  canonical_name: string;
  country: string;
  region: string | null;
  city: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type Document = {
  id: string;
  entity_id: string;
  slug: string;
  lang: string;
  country: string;
  title: string;
  category: string;
  template: string;
  status: DocumentStatus;
  confidence: Confidence;
  last_verified_at: string | null;
  license_code: string;
  data: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
};

export type Claim = {
  id: string;
  document_id: string;
  entity_id: string;
  field_path: string;
  claim_text: string;
  claim_value: string;
  jurisdiction: string | null;
  confidence: Confidence;
  status: ClaimStatus;
  last_verified_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type ClaimSource = {
  id: string;
  claim_id: string;
  source_type: SourceType;
  title: string | null;
  url: string | null;
  citation: string | null;
  observed_at: string | null;
  contributor_hash: string | null;
  created_at: string | null;
};

export type EditSubmission = {
  id: string;
  document_id: string | null;
  entity_id: string | null;
  field_path: string | null;
  proposed_value: string | null;
  reason: string | null;
  contributor_hash: string | null;
  status: SubmissionStatus;
  created_at: string | null;
};

export type ReportSubmission = {
  id: string;
  document_id: string | null;
  entity_id: string | null;
  report_type: string;
  message: string;
  contributor_hash: string | null;
  status: SubmissionStatus;
  created_at: string | null;
};

export type HallucinationReport = {
  id: string;
  document_id: string | null;
  entity_id: string | null;
  ai_service: string;
  prompt: string | null;
  ai_answer: string | null;
  expected_correction: string | null;
  claim_id: string | null;
  wrong_answer_type: string | null;
  correction_prompt: string | null;
  share_card: Record<string, unknown>;
  moderation_note: string | null;
  contributor_hash: string | null;
  status: SubmissionStatus;
  created_at: string | null;
};

export type VerificationEvent = {
  id: string;
  claim_id: string;
  event_type: VerificationEventType;
  previous_status: ClaimStatus | null;
  new_status: ClaimStatus | null;
  previous_confidence: Confidence | null;
  new_confidence: Confidence | null;
  note: string | null;
  contributor_hash: string | null;
  created_at: string | null;
};

export type Listing = {
  id: string;
  entity_id: string;
  document_id: string | null;
  lang: string;
  slug: string;
  title: string;
  summary: string | null;
  status: DocumentStatus;
  confidence: Confidence;
  created_at: string | null;
  updated_at: string | null;
};

export type ClaimWithSources = Claim & {
  sources: ClaimSource[];
  verification_events: VerificationEvent[];
};

export type RegistryDocumentBundle = {
  entity: Entity;
  document: Document;
  claims: ClaimWithSources[];
  listing: Listing | null;
};

export type CommunityPostAuthorType = "user" | "ai" | "admin";
export type CommunityPostStatus = "pending" | "published" | "hidden" | "spam" | "deleted";

export type CommunityPost = {
  id: string;
  document_id: string | null;
  author_type: CommunityPostAuthorType;
  author_name: string;
  content: string;
  contributor_hash: string | null;
  status: CommunityPostStatus;
  created_at: string;
  updated_at: string;
  document_title?: string;
  document_slug?: string;
};

export type DocumentStats = {
  document_id: string;
  view_count: number;
  ai_citation_count: number;
  updated_at: string;
};
