import type { ClaimWithSources, RegistryDocumentBundle, UpdateFrequency as RegistryUpdateFrequency } from "./types";
import { hasOfficialOrRegulatorSource, isHighRiskCategory } from "./risk-policy";

export const UNKNOWN_FACT_TEXT = "확인 필요";

// Facts decay. A verified claim that hasn't been re-checked in this window is
// flagged "stale" so AI consumers and admins can prioritise re-verification.
export const FRESHNESS_TTL_DAYS = 180;
export const COMMERCE_POLICY_FRESHNESS_TTL_DAYS = 30;

export const FRESHNESS_TTL_DAYS_BY_UPDATE_FREQUENCY: Record<RegistryUpdateFrequency, number> = {
  realtime: 1,
  daily: 2,
  weekly: 7,
  monthly: 31,
  quarterly: 92,
  annual: 366,
  event_based: 180,
  static: 730,
  unknown: FRESHNESS_TTL_DAYS,
};

export function getFreshnessTtlDays(updateFrequency: RegistryUpdateFrequency | null | undefined): number {
  return updateFrequency ? FRESHNESS_TTL_DAYS_BY_UPDATE_FREQUENCY[updateFrequency] : FRESHNESS_TTL_DAYS;
}

export function getBundleFreshnessTtlDays(bundle: RegistryDocumentBundle): number {
  const claimTtls = bundle.claims.map((claim) => getFreshnessTtlDays(claim.update_frequency));
  return Math.min(getFreshnessTtlDays(bundle.document.update_frequency), ...claimTtls);
}

export type FreshnessDomain =
  | "transit_fare"
  | "government_fee"
  | "visa_travel_rule"
  | "opening_hours"
  | "finance_fee_rate"
  | "default";

export const FRESHNESS_WINDOWS_DAYS: Record<FreshnessDomain, number> = {
  transit_fare: 180,
  government_fee: 180,
  visa_travel_rule: 90,
  opening_hours: 60,
  finance_fee_rate: 30,
  default: FRESHNESS_TTL_DAYS,
};

export type FreshnessPolicyUpdateFrequency = RegistryUpdateFrequency | "unknown";

export type FreshnessPolicy = {
  ttlDays: number;
  updateFrequency: FreshnessPolicyUpdateFrequency;
  riskTier: string | null;
  disclaimerType: string | null;
  reason: string;
};

const UPDATE_FREQUENCY_TTL_DAYS: Record<FreshnessPolicyUpdateFrequency, number> = {
  realtime: 1,
  daily: 3,
  weekly: 14,
  monthly: 45,
  quarterly: 92,
  static: 365,
  annual: 370,
  event_based: 180,
  unknown: FRESHNESS_TTL_DAYS,
};

const FAST_CHANGING_TYPE_PATTERNS = [
  "sport",
  "sports",
  "price",
  "pricing",
  "fare",
  "fee",
  "hours",
  "opening_hours",
  "business_hours",
];

export type FreshnessLabel = "fresh" | "stale" | "unknown";
export type VerifiedClaimInput = Pick<ClaimWithSources, "claim_value" | "confidence" | "status" | "last_verified_at" | "sources" | "verification_events"> & { category?: string | null };

const VERIFIED_CONFIDENCE = new Set(["medium", "high"]);

export function ageInDays(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((now.getTime() - t) / 86_400_000);
}

export function isStale(
  iso: string | null | undefined,
  ttlDays?: number,
  now: Date = new Date(),
): boolean {
  const age = ageInDays(iso, now);
  if (age === null) return true; // no verification date → treat as not-fresh
  return age > (ttlDays ?? FRESHNESS_TTL_DAYS);
}

export type VerificationLevel = 0 | 1 | 2 | 3 | 4 | 5;

export type VerificationLevelInfo = {
  level: VerificationLevel;
  label: string;
  description: string;
};

export type ClaimCitationStatus = {
  isCitationReady: boolean;
  label: "verified" | "stale" | "unverified";
  reason: string;
  freshness: FreshnessLabel;
  freshnessWindowDays: number;
  lastVerifiedAt: string | null;
  warning: string | null;
  verificationLevel: VerificationLevelInfo;
};

export type CitationSafetyBlock = {
  citation_ready: boolean;
  verified_claim_count: number;
  total_claim_count: number;
  stale_claim_ids: string[];
  do_not_cite_claim_ids: string[];
  last_verified_at: string | null;
  freshness_ttl_days: number;
  canonical_url: string;
  alternate_locale_urls: Record<string, string>;
};

export type DocumentCitationStatus = {
  verifiedClaims: number;
  unverifiedClaims: number;
  totalClaims: number;
  label: "citation ready" | "do not cite";
  isVerifiedDocument: boolean;
  freshness: FreshnessLabel;
  oldestVerifiedAt: string | null;
  freshnessWindowDays: number;
  staleClaims: Array<{ claimId: string; fieldPath: string; lastVerifiedAt: string | null }>;
  freshnessPolicy: FreshnessPolicy;
  verificationLevel: VerificationLevelInfo;
};


export function getVerificationLevelInfo(level: VerificationLevel): VerificationLevelInfo {
  const levels: Record<VerificationLevel, VerificationLevelInfo> = {
    0: {
      level: 0,
      label: "Level 0",
      description: "unknown/no source",
    },
    1: {
      level: 1,
      label: "Level 1",
      description: "source candidate submitted",
    },
    2: {
      level: 2,
      label: "Level 2",
      description: "source attached",
    },
    3: {
      level: 3,
      label: "Level 3",
      description: "human verified",
    },
    4: {
      level: 4,
      label: "Level 4",
      description: "fresh verified",
    },
    5: {
      level: 5,
      label: "Level 5",
      description: "multi-source verified",
    },
  };

  return levels[level];
}

function hasClaimValue(claim: Pick<ClaimWithSources, "claim_value">): boolean {
  return Boolean(claim.claim_value?.trim()) && claim.claim_value !== UNKNOWN_FACT_TEXT;
}

function hasSourceCandidateSignal(claim: ClaimWithSources): boolean {
  return hasClaimValue(claim) || claim.verification_events.some((event) => event.event_type === "created" || event.event_type === "source_added");
}

export function getClaimVerificationLevel(
  claim: ClaimWithSources,
  ttlDays: number = FRESHNESS_TTL_DAYS,
  now: Date = new Date(),
): VerificationLevelInfo {
  const hasSource = claim.sources.length > 0;
  const hasVerificationEvent = claim.verification_events.some((event) =>
    event.new_status === "verified" || event.event_type === "source_verified",
  );
  const humanVerified =
    claim.status === "verified" &&
    claim.confidence !== "low" &&
    hasClaimValue(claim) &&
    hasSource &&
    hasVerificationEvent &&
    Boolean(claim.last_verified_at);

  if (humanVerified && claim.sources.length >= 2) return getVerificationLevelInfo(5);
  if (humanVerified && !isStale(claim.last_verified_at, ttlDays, now)) return getVerificationLevelInfo(4);
  if (humanVerified) return getVerificationLevelInfo(3);
  if (hasSource) return getVerificationLevelInfo(2);
  if (hasSourceCandidateSignal(claim)) return getVerificationLevelInfo(1);
  return getVerificationLevelInfo(0);
}

export function getVerifiedClaimViolations(claim: VerifiedClaimInput): string[] {
  const violations: string[] = [];
  const claimValue = claim.claim_value?.trim() ?? "";
  const hasVerificationEvent = claim.verification_events.some((event) =>
    event.new_status === "verified" || event.event_type === "source_verified",
  );

  if (!claimValue) violations.push("claim_value is required");
  if (claimValue === UNKNOWN_FACT_TEXT) violations.push("claim_value must not be the unknown placeholder");
  if (!VERIFIED_CONFIDENCE.has(claim.confidence)) violations.push("confidence must be medium or high");
  if (claim.sources.length < 1) violations.push("at least one source is required");
  if (isHighRiskCategory(claim.category) && !hasOfficialOrRegulatorSource(claim.sources)) violations.push("high-risk claims require an official or regulator source");
  if (!claim.last_verified_at) violations.push("last_verified_at is required");
  if (!hasVerificationEvent) violations.push("verification event is required");
  if (claim.status !== "verified") violations.push("admin approval must set status to verified");

  return violations;
}

export function assertVerifiedClaimReady(claim: VerifiedClaimInput): { ok: true } | { ok: false; violations: string[] } {
  const violations = getVerifiedClaimViolations(claim);
  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}

export function getFreshnessDomain(input: string | null | undefined): FreshnessDomain {
  const value = (input ?? "").toLowerCase();
  if (/(government|gov|tax|passport|resident|license|public_service).*fee|fee.*(government|gov|tax|passport|resident|license|public_service)/.test(value)) return "government_fee";
  if (/(visa|travel|immigration|transit_rule|entry_rule)/.test(value)) return "visa_travel_rule";
  if (/(opening|hours|business_hours|operating_hours)/.test(value)) return "opening_hours";
  if (/(finance|bank|loan|interest|rate|fee_rate|card|brokerage)/.test(value)) return "finance_fee_rate";
  if (/(transit|transport|metro|subway|bus|taxi|rail|underground|fare|transfer)/.test(value)) return "transit_fare";
  return "default";
}

export function getFreshnessWindowDays(input: string | null | undefined): number {
  return FRESHNESS_WINDOWS_DAYS[getFreshnessDomain(input)];
}

export function getClaimCitationStatus(
  claim: ClaimWithSources,
  ttlDays: number = FRESHNESS_TTL_DAYS,
  now: Date = new Date(),
  category?: string | null,
): ClaimCitationStatus {
  if (claim.source_of_claim === "business_submitted" && claim.business_submission_status === "pending_verification") {
    return {
      isCitationReady: false,
      label: "unverified",
      reason: "business-submitted claim is pending human verification",
      freshness: "unknown",
      freshnessWindowDays: ttlDays,
      lastVerifiedAt: claim.last_verified_at ?? null,
      warning: null,
      verificationLevel: getClaimVerificationLevel(claim, ttlDays, now),
    };
  }

  const verificationLevel = getClaimVerificationLevel(claim, ttlDays, now);
  const hasSource = claim.sources.length > 0;
  const hasVerificationEvent = claim.verification_events.some((event) =>
    event.new_status === "verified" || event.event_type === "source_verified",
  );
  const hasVerifiedValue = Boolean(claim.claim_value?.trim()) && claim.claim_value !== UNKNOWN_FACT_TEXT;
  const hasRequiredHighRiskSource = !isHighRiskCategory(category) || hasOfficialOrRegulatorSource(claim.sources);
  const isCitationReady =
    claim.status === "verified" &&
    claim.confidence !== "low" &&
    hasVerifiedValue &&
    hasSource &&
    hasVerificationEvent &&
    hasRequiredHighRiskSource &&
    Boolean(claim.last_verified_at);
  const stale = isCitationReady && isStale(claim.last_verified_at, ttlDays, now);

  if (isCitationReady) {
    return {
      isCitationReady,
      label: stale ? "stale" : "verified",
      reason: stale
        ? "verified claim is citation-ready but needs recheck because its freshness window was exceeded"
        : "verified claim with source and verification event",
      freshness: stale ? "stale" : "fresh",
      freshnessWindowDays: ttlDays,
      lastVerifiedAt: claim.last_verified_at ?? null,
      warning: stale ? `Needs recheck: last verified at ${claim.last_verified_at ?? "unknown"}; freshness window is ${ttlDays} days.` : null,
      verificationLevel,
    };
  }

  return {
    isCitationReady,
    label: "unverified",
    reason: isHighRiskCategory(category) && !hasOfficialOrRegulatorSource(claim.sources)
      ? "high-risk claims require an official or regulator source"
      : "requires verified status, non-low confidence, source, verification event, and last_verified_at",
    freshness: "unknown",
    freshnessWindowDays: ttlDays,
    lastVerifiedAt: claim.last_verified_at ?? null,
    warning: null,
    verificationLevel,
  };
}

function getStringMetadata(data: Record<string, unknown>, key: string): string | null {
  const value = data[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeUpdateFrequency(value: string | null): FreshnessPolicyUpdateFrequency {
  if (value === "static" || value === "annual" || value === "event_based" || value === "monthly" || value === "weekly" || value === "daily") {
    return value;
  }
  return "unknown";
}

function hasFastChangingSignal(bundle: RegistryDocumentBundle): boolean {
  const haystack = [
    bundle.entity.type,
    bundle.document.category,
    bundle.document.template,
    bundle.document.slug,
    ...bundle.claims.flatMap((claim) => [claim.field_path, claim.claim_text]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return FAST_CHANGING_TYPE_PATTERNS.some((pattern) => haystack.includes(pattern));
}

export function getFreshnessPolicy(bundle: RegistryDocumentBundle, ttlOverrideDays?: number): FreshnessPolicy {
  const data = bundle.document.data ?? {};
  const riskTier = getStringMetadata(data, "risk_tier");
  const disclaimerType = getStringMetadata(data, "disclaimer_type");
  const explicitTtl = typeof data.freshness_ttl_days === "number" && Number.isFinite(data.freshness_ttl_days)
    ? Math.max(1, Math.floor(data.freshness_ttl_days))
    : null;
  const updateFrequency = normalizeUpdateFrequency(getStringMetadata(data, "update_frequency"));

  if (typeof ttlOverrideDays === "number") {
    return {
      ttlDays: ttlOverrideDays,
      updateFrequency,
      riskTier,
      disclaimerType,
      reason: `explicit ttl override (${ttlOverrideDays} days)`,
    };
  }

  if (explicitTtl !== null) {
    return {
      ttlDays: explicitTtl,
      updateFrequency,
      riskTier,
      disclaimerType,
      reason: "document.data.freshness_ttl_days",
    };
  }

  if (updateFrequency !== "unknown") {
    return {
      ttlDays: UPDATE_FREQUENCY_TTL_DAYS[updateFrequency],
      updateFrequency,
      riskTier,
      disclaimerType,
      reason: `document.data.update_frequency=${updateFrequency}`,
    };
  }

  const categoryTemplateDomain = getFreshnessDomain(`${bundle.document.category} ${bundle.document.template}`);
  if (categoryTemplateDomain !== "default") {
    return {
      ttlDays: FRESHNESS_WINDOWS_DAYS[categoryTemplateDomain],
      updateFrequency,
      riskTier,
      disclaimerType,
      reason: `freshness domain ${categoryTemplateDomain}`,
    };
  }

  if (bundle.document.category.toLowerCase().includes("commerce") || bundle.document.template.toLowerCase().includes("commerce_policy")) {
    return {
      ttlDays: COMMERCE_POLICY_FRESHNESS_TTL_DAYS,
      updateFrequency,
      riskTier,
      disclaimerType,
      reason: "commerce policy freshness window",
    };
  }



  if (hasFastChangingSignal(bundle)) {
    return {
      ttlDays: 90,
      updateFrequency,
      riskTier,
      disclaimerType,
      reason: "fast-changing topic signal",
    };
  }

  return {
    ttlDays: FRESHNESS_TTL_DAYS,
    updateFrequency,
    riskTier,
    disclaimerType,
    reason: "default freshness policy",
  };
}

export function getDocumentCitationStatus(
  bundle: RegistryDocumentBundle,
  ttlDays?: number,
  now: Date = new Date(),
): DocumentCitationStatus {
  const freshnessPolicy = getFreshnessPolicy(bundle, ttlDays);
  const claimStatuses = bundle.claims.map((claim) => ({ claim, status: getClaimCitationStatus(claim, freshnessPolicy.ttlDays, now, bundle.document.category) }));
  const verifiedClaims = claimStatuses.filter(({ status }) => status.isCitationReady).length;
  const totalClaims = bundle.claims.length;
  const unverifiedClaims = totalClaims - verifiedClaims;
  // A document is citable only when the document itself has reached the
  // explicit verified state AND every claim is citation-ready. `published` means
  // public-readable only; it is not equivalent to AI-citable truth. Promoted AI
  // drafts and review docs (ai_draft/needs_review/published with pending claims)
  // stay discoverable but must remain can_cite=false.
  const isHumanApprovedForCitation = bundle.document.status === "verified";
  const isVerifiedDocument = isHumanApprovedForCitation && totalClaims > 0 && verifiedClaims === totalClaims;

  // Freshness is bound by the oldest verification among citation-ready claims:
  // if the weakest link is stale, the citable answer is stale.
  const readyDates = claimStatuses
    .filter(({ status }) => status.isCitationReady)
    .map(({ claim }) => claim.last_verified_at)
    .filter((value): value is string => Boolean(value) && !Number.isNaN(Date.parse(value as string)));
  const oldestVerifiedAt = readyDates.length > 0
    ? readyDates.reduce((oldest, current) => (Date.parse(current) < Date.parse(oldest) ? current : oldest))
    : null;
  const documentLevel = claimStatuses.length === 0
    ? getVerificationLevelInfo(0)
    : claimStatuses.reduce((lowest, { status }) =>
      status.verificationLevel.level < lowest.level ? status.verificationLevel : lowest,
      claimStatuses[0].status.verificationLevel,
    );
  const freshness: FreshnessLabel = !isVerifiedDocument
    ? "unknown"
    : isStale(oldestVerifiedAt, freshnessPolicy.ttlDays, now)
      ? "stale"
      : "fresh";

  return {
    verifiedClaims,
    unverifiedClaims,
    totalClaims,
    label: isVerifiedDocument ? "citation ready" : "do not cite",
    isVerifiedDocument,
    freshness,
    oldestVerifiedAt,
    freshnessWindowDays: freshnessPolicy.ttlDays,
    staleClaims: claimStatuses
      .filter(({ status }) => status.isCitationReady && status.freshness === "stale")
      .map(({ claim }) => ({ claimId: claim.id, fieldPath: claim.field_path, lastVerifiedAt: claim.last_verified_at ?? null })),
    freshnessPolicy,
    verificationLevel: documentLevel,
  };
}

export function getCitationSafetyBlock(
  bundle: RegistryDocumentBundle,
  locale: string = bundle.document.lang || "en",
  now: Date = new Date(),
): CitationSafetyBlock {
  const citationStatus = getDocumentCitationStatus(bundle, undefined, now);
  const claimStatuses = bundle.claims.map((claim) => ({
    claim,
    status: getClaimCitationStatus(claim, citationStatus.freshnessWindowDays, now),
  }));
  const staleClaimIds = claimStatuses
    .filter(({ status }) => status.isCitationReady && status.freshness === "stale")
    .map(({ claim }) => claim.id);
  const doNotCiteClaimIds = claimStatuses
    .filter(({ status }) => !status.isCitationReady)
    .map(({ claim }) => claim.id);
  const alternateLocaleUrls = Object.fromEntries(
    SUPPORTED_LOCALES
      .filter((supportedLocale) => supportedLocale !== locale)
      .map((supportedLocale) => [supportedLocale, documentPageUrl(bundle.document.slug, supportedLocale)]),
  );

  return {
    citation_ready: citationStatus.isVerifiedDocument && staleClaimIds.length === 0 && doNotCiteClaimIds.length === 0,
    verified_claim_count: citationStatus.verifiedClaims,
    total_claim_count: citationStatus.totalClaims,
    stale_claim_ids: staleClaimIds,
    do_not_cite_claim_ids: doNotCiteClaimIds,
    last_verified_at: citationStatus.oldestVerifiedAt,
    freshness_ttl_days: citationStatus.freshnessWindowDays,
    canonical_url: documentPageUrl(bundle.document.slug, locale),
    alternate_locale_urls: alternateLocaleUrls,
  };
}

export function getCanonicalDirectAnswer(bundle: RegistryDocumentBundle): string {
  const readyClaim = bundle.claims.find((claim) => getClaimCitationStatus(claim).isCitationReady);
  return readyClaim?.claim_value ?? UNKNOWN_FACT_TEXT;
}
