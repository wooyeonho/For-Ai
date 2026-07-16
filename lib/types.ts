export type Confidence = "low" | "medium" | "high";
export type DocumentStatus = "ai_draft" | "needs_review" | "verified" | "published" | "archived";
export type ClaimStatus = "needs_review" | "verified" | "disputed" | "unknown";
export type SourceCheckStatus = "unchecked" | "passed" | "warning" | "failed";
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
export type RiskTier = "low" | "medium" | "high" | "forbidden" | "standard";
export type UpdateFrequency = "realtime" | "daily" | "weekly" | "monthly" | "quarterly" | "annual" | "event_based" | "static" | "unknown";
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
export type TranslationStatus = "source_language" | "human_translated" | "human_reviewed" | "machine_translated" | "needs_translation_review" | "needs_human_translation_review";

export type LocalizedTitle = Record<string, string>;

export type SubmissionStatus = "new" | "reviewing" | "accepted" | "rejected" | "spam" | "spam_suspected";
export type VerificationEventType =
  | "created"
  | "reviewed"
  | "source_added"
  | "source_removed"
  | "source_verified"
  | "status_changed"
  | "confidence_changed"
  | "source_verified";

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
  contributor_hash?: string | null;
  // Task 5-0 publication boundary fields (optional: most existing call sites
  // select specific columns and predate these; always present on a real DB row).
  content_origin?: ContentOrigin;
  current_claim_version_id?: string | null;
  published_claim_version_id?: string | null;
  publication_mode?: PublicationMode;
  publication_state?: ClaimPublicationState;
  published_at?: string | null;
  freshness_profile?: string | null;
  valid_from?: string | null;
  valid_until?: string | null;
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
  source_check_status?: SourceCheckStatus | null;
  source_trust_score?: number | null;
  source_check_notes?: string | null;
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

export type NotificationPreference = "none" | "in_app" | "email_digest" | "webhook";
export type WatchEventType = "claim_stale" | "source_update_needed" | "verified_fix";
export type MissionStatus = "open" | "in_progress" | "resolved" | "expired";
export type RewardBadge = "stale_claim_fixer" | "source_updater" | "topic_steward";

export type TopicAdoption = {
  id: string;
  contributor_id: string | null;
  contributor_hash: string | null;
  entity_id: string | null;
  document_id: string | null;
  category: string | null;
  country: string;
  notification_preference: NotificationPreference;
  active: boolean;
  created_at: string;
};

export type WatchSubscription = {
  id: string;
  topic_adoption_id: string | null;
  contributor_id: string | null;
  contributor_hash: string | null;
  entity_id: string | null;
  document_id: string | null;
  claim_id: string | null;
  category: string | null;
  country: string;
  event_type: WatchEventType;
  notification_preference: NotificationPreference;
  mission_status: MissionStatus;
  source_update_needed: boolean;
  notification_sent_at: string | null;
  mission_created_at: string | null;
  resolved_at: string | null;
  resolved_by_contributor_hash: string | null;
  awarded_badge: RewardBadge | null;
  awarded_points: number;
  created_at: string;
};

// --- Task 5-0: structural foundation ----------------------------------------
// Mirrors supabase/migrations/20260716120955_task5_structural_foundation.sql.

export type ContentOrigin = "legacy_manual" | "task5_ai";
export type PublicationMode = "manual_legacy" | "assisted_operator" | "crowd_auto";
export type ClaimPublicationState = "active" | "quarantined" | "withdrawn";
export type RiskResult = "unknown" | "normal" | "high";
export type ClaimEvidenceRelation = "supports" | "qualifies" | "contradicts";
export type VerificationPolicyMode = "assisted_operator" | "crowd";

export type ClaimVersion = {
  id: string;
  claim_id: string;
  version: number;
  text: string;
  text_hash: string;
  created_by: string | null;
  created_at: string;
};

export type RiskAssessment = {
  id: string;
  claim_version_id: string;
  deterministic_result: RiskResult;
  model_result: RiskResult;
  final_result: RiskResult;
  deterministic_policy_version: string;
  model_id: string | null;
  prompt_version: string | null;
  failure_reason: string | null;
  created_at: string;
};

export type SourceSnapshot = {
  id: string;
  source_id: string | null;
  canonical_url: string;
  final_url: string;
  retrieved_at: string;
  http_status: number;
  content_type: string;
  content_hash: string;
  normalized_text_hash: string;
  // normalized_text/storage_path are server-only; never included in a public API shape.
  etag: string | null;
  last_modified: string | null;
  created_at: string;
};

export type ClaimEvidence = {
  id: string;
  claim_version_id: string;
  source_snapshot_id: string;
  quote_start: number;
  quote_end: number;
  quote_hash: string;
  context_hash: string | null;
  relation: ClaimEvidenceRelation;
  is_required: boolean;
  created_at: string;
};

export type VerificationPolicy = {
  version: number;
  mode: VerificationPolicyMode;
  rules: Record<string, unknown>;
  effective_from: string;
  created_by: string | null;
  created_at: string;
};

export type Task5Settings = {
  id: true;
  phase: 0 | 1 | 2 | 3 | 4;
  draft_enabled: boolean;
  updated_at: string;
  updated_by: string | null;
};

// --- Task 5-A: demand signals -----------------------------------------------
// Mirrors supabase/migrations/20260716210425_task5_a_demand_signals.sql.

export type WantedClaimStatus =
  | "observing"
  | "open"
  | "drafting"
  | "drafted"
  | "published"
  | "rejected_editorial"
  | "closed_infra_failure";
export type WantedClaimDemandSignalSource = "user_suggestion" | "search_gap";

export type Contributor = {
  id: string;
  contributor_hash: string | null;
  account_id: string | null;
  total_points: number;
  accepted_source_count: number;
  verified_claim_link_count: number;
  spam_submission_count: number;
  created_at: string;
  updated_at: string;
};

export type WantedClaim = {
  id: string;
  locale: string;
  normalization_version: number;
  normalized_text: string;
  normalized_hash: string;
  status: WantedClaimStatus;
  draft_failure_count: number;
  // Reserved for Task 5-B2/5-P1; always null until those tasks land.
  draft_claim_id: string | null;
  published_claim_id: string | null;
  lease_owner: string | null;
  lease_expires_at: string | null;
  last_demand_at: string | null;
  created_at: string;
  updated_at: string;
};

export type WantedClaimDemandSignal = {
  id: string;
  wanted_claim_id: string;
  source: WantedClaimDemandSignalSource;
  bucket_date: string;
  dedupe_epoch: string;
  actor_key: string;
  created_at: string;
  expires_at: string;
};

export type WantedClaimSuggester = {
  wanted_claim_id: string;
  contributor_id: string;
  created_at: string;
  notification_sent_at: string | null;
};

export type Task5RunState = "running" | "completed" | "partial" | "failed" | "skipped";
export type DraftAttemptState =
  | "leased"
  | "source_discovery"
  | "structuring"
  | "risk_assessment"
  | "completed"
  | "retryable_failed"
  | "permanent_failed";

export type Task5Run = {
  id: string;
  run_type: "shadow_draft";
  scheduled_for: string;
  started_at: string;
  completed_at: string | null;
  state: Task5RunState;
  leased_count: number;
  success_count: number;
  failure_count: number;
  correlation_id: string;
  error_code: string | null;
};

export type DraftAttempt = {
  id: string;
  wanted_claim_id: string;
  run_id: string;
  worker_id: string;
  prompt_version: string;
  risk_prompt_version: string;
  idempotency_key: string;
  state: DraftAttemptState;
  attempt_number: number;
  lease_expires_at: string;
  model_provenance: Array<Record<string, unknown>>;
  claim_id: string | null;
  source_snapshot_id: string | null;
  error_class: string | null;
  error_code: string | null;
  started_at: string;
  completed_at: string | null;
};
