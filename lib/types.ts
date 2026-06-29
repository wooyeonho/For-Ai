export type Confidence = "low" | "medium" | "high";
export type TranslationStatus = "machine_translated" | "human_reviewed";
export type DocumentStatus = "ai_draft" | "needs_review" | "verified" | "published" | "archived";
export type ClaimStatus = "needs_review" | "verified" | "disputed" | "unknown";
export type ClaimSourceOfClaim = "independent" | "business_submitted" | "sponsored";

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

export type CommercePolicyFieldPath =
  | "return.window_days"
  | "refund.method"
  | "refund.processing_time"
  | "cancellation.deadline"
  | "shipping.return_cost"
  | "exceptions"
  | "official_policy_url";

export type SourceType =
  | "official"
  | "platform"
  | "review"
  | "user"
  | "phone"
  | "photo"
  | "document"
  | "web"
  | "other"
  | "unknown";
export type RiskTier = "low" | "medium" | "high" | "forbidden";
export type UpdateFrequency = "realtime" | "daily" | "weekly" | "monthly" | "quarterly" | "annual" | "event_based" | "static";
export type DisclaimerType =
  | "none"
  | "check_official_source"
  | "not_medical_advice"
  | "not_financial_advice"
  | "not_legal_advice"
  | "not_genetic_or_medical_advice"
  | "public_profile_only"
  | "realtime_data_required";
export type SourceAuthority = "primary" | "official" | "regulator" | "legal" | "platform" | "secondary" | "community" | "unknown";
export type TranslationStatus = "source_language" | "human_translated" | "machine_translated" | "needs_translation_review";

export type LocalizedTitle = Record<string, string>;

export type SubmissionStatus = "new" | "reviewing" | "accepted" | "rejected" | "spam";
export type VerificationEventType =
  | "created"
  | "reviewed"
  | "source_added"
  | "source_removed"
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
  region: string | null;
  city: string | null;
  jurisdiction: string;
  canonical_slug: string;
  title: string;
  localized_title: LocalizedTitle;
  category: string;
  template: string;
  status: DocumentStatus;
  confidence: Confidence;
  risk_tier: RiskTier;
  update_frequency: UpdateFrequency;
  disclaimer_type: DisclaimerType;
  translation_status: TranslationStatus;
  last_verified_at: string | null;
  license_code: string;
  data: Record<string, unknown>;
  freshness_ttl_days?: number | null;
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
  jurisdiction: string;
  country: string;
  region: string | null;
  city: string | null;
  risk_tier: RiskTier;
  update_frequency: UpdateFrequency;
  disclaimer_type: DisclaimerType;
  lang: string;
  original_claim_id: string | null;
  translation_status: TranslationStatus | null;
  confidence: Confidence;
  status: ClaimStatus;
  last_verified_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  source_of_claim?: ClaimSourceOfClaim;
  business_submission_status?: "pending_verification" | "accepted" | "rejected" | null;
  submitted_by_business_name?: string | null;
};

export type ClaimSource = {
  id: string;
  claim_id: string;
  source_type: SourceType;
  source_authority: SourceAuthority;
  title: string | null;
  url: string | null;
  citation: string | null;
  lang: string | null;
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
