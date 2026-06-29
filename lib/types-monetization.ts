// Monetization types for For-Ai global fact registry.
// Corresponds to schema-v3-monetization.sql tables.

export type ApiTier = "free" | "pro" | "enterprise";
export type BusinessProfileStatus = "pending" | "verified" | "suspended" | "rejected";
export type CorrectionPriority = "standard" | "priority" | "urgent";
export type BusinessClaimProposalStatus = "new" | "reviewing" | "accepted" | "rejected" | "withdrawn";
export type AlertSeverity = "info" | "warning" | "critical";
export type ClaimSourceOfClaim = "independent" | "business_submitted" | "sponsored";
export type BusinessSubmittedClaimStatus = "pending_verification" | "accepted" | "rejected";
export type AlertType =
  | "incorrect_citation"
  | "outdated_fact"
  | "new_hallucination"
  | "claim_disputed"
  | "verification_expired";
export type PlacementType = "category_featured" | "search_promoted" | "related_entity";

export type VerifiedBusinessProfile = {
  id: string;
  entity_id: string;
  business_name: string;
  business_email: string;
  business_url: string | null;
  country: string;
  industry: string | null;
  contact_name: string | null;
  verification_method: "email" | "domain" | "document" | "phone";
  status: BusinessProfileStatus;
  tier: ApiTier;
  verified_at: string | null;
  expires_at: string | null;
  metadata: Record<string, unknown>;
  contributor_hash: string | null;
  created_at: string;
  updated_at: string;
};

export type ApiKey = {
  id: string;
  profile_id: string | null;
  key_prefix: string;
  name: string;
  tier: ApiTier;
  rate_limit_rpm: number;
  rate_limit_daily: number;
  scopes: string[];
  is_active: boolean;
  revoked_at: string | null;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
};

export type BusinessSubmittedClaim = {
  id: string;
  profile_id: string;
  entity_id: string;
  document_id: string | null;
  conflicts_with_claim_id: string | null;
  field_path: string;
  claim_text: string;
  claim_value: string;
  source_url: string | null;
  source_type: string;
  status: BusinessSubmittedClaimStatus;
  citation_ready: false;
  reviewed_at: string | null;
  reviewer_note: string | null;
  created_at: string;
  updated_at: string;
};

export type BusinessCorrection = {
  id: string;
  profile_id: string;
  entity_id: string;
  claim_id: string | null;
  field_path: string;
  current_value: string | null;
  proposed_value: string;
  reason: string;
  source_url: string | null;
  source_type: string;
  priority: CorrectionPriority;
  status: string;
  reviewed_at: string | null;
  reviewer_note: string | null;
  created_at: string;
  updated_at: string;
};


export type BusinessClaimProposal = {
  id: string;
  profile_id: string;
  entity_id: string;
  document_id: string | null;
  claim_id: string | null;
  field_path: string;
  proposed_claim_text: string;
  proposed_value: string;
  source_url: string | null;
  source_type: string;
  status: BusinessClaimProposalStatus;
  reviewer_note: string | null;
  reviewed_at: string | null;
  contributor_hash: string | null;
  created_at: string;
  updated_at: string;
};

export type ReputationAlert = {
  id: string;
  profile_id: string;
  entity_id: string;
  alert_type: AlertType;
  severity: AlertSeverity;
  title: string;
  description: string | null;
  related_claim_id: string | null;
  ai_service: string | null;
  is_read: boolean;
  is_resolved: boolean;
  resolved_at: string | null;
  created_at: string;
};

export const REQUIRED_SPONSORED_LABEL = "Sponsored" as const;
export const SPONSORED_NOT_FACTUAL_CLAIM_LABEL = "Sponsored — not a verified factual claim" as const;

export type SponsoredPlacement = {
  id: string;
  profile_id: string;
  entity_id: string;
  placement_type: PlacementType;
  category: string | null;
  display_label: string;
  target_url: string | null;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  impressions: number;
  clicks: number;
  created_at: string;
};

// API tier configuration (static, used in rate limiting and pricing display)
export const API_TIER_CONFIG: Record<ApiTier, {
  name: string;
  rate_limit_rpm: number;
  rate_limit_daily: number;
  price_monthly_usd: number | null;
  features: string[];
}> = {
  free: {
    name: "Free",
    rate_limit_rpm: 60,
    rate_limit_daily: 1000,
    price_monthly_usd: null,
    features: [
      "Read access to all verified claims",
      "JSON and Markdown endpoints",
      "Basic citation API",
      "60 requests/minute",
      "1,000 requests/day",
    ],
  },
  pro: {
    name: "Pro",
    rate_limit_rpm: 300,
    rate_limit_daily: 50000,
    price_monthly_usd: 49,
    features: [
      "Everything in Free",
      "Bulk citation API",
      "Webhook notifications",
      "Priority support",
      "300 requests/minute",
      "50,000 requests/day",
      "Business correction tools",
    ],
  },
  enterprise: {
    name: "Enterprise",
    rate_limit_rpm: 1000,
    rate_limit_daily: 500000,
    price_monthly_usd: null,
    features: [
      "Everything in Pro",
      "Custom rate limits",
      "Data licensing",
      "Dedicated support",
      "SLA guarantee",
      "Reputation monitoring",
      "White-label integration",
    ],
  },
};
