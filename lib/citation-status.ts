import type { ClaimWithSources, RegistryDocumentBundle, UpdateFrequency } from "./types";

export const UNKNOWN_FACT_TEXT = "확인 필요";

// Facts decay. A verified claim that hasn't been re-checked in this window is
// flagged "stale" so AI consumers and admins can prioritise re-verification.
export const FRESHNESS_TTL_DAYS = 180;
export const COMMERCE_POLICY_FRESHNESS_TTL_DAYS = 30;

export const FRESHNESS_TTL_DAYS_BY_UPDATE_FREQUENCY: Record<UpdateFrequency, number> = {
  realtime: 1,
  daily: 2,
  weekly: 7,
  monthly: 31,
  quarterly: 92,
  annual: 366,
  event_based: 180,
  static: 730,
};

export function getFreshnessTtlDays(updateFrequency: UpdateFrequency | null | undefined): number {
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

export type FreshnessLabel = "fresh" | "stale" | "unknown";
export type VerifiedClaimInput = Pick<ClaimWithSources, "claim_value" | "confidence" | "status" | "last_verified_at" | "sources" | "verification_events">;

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

export type ClaimCitationStatus = {
  isCitationReady: boolean;
  label: "verified" | "stale" | "unverified";
  reason: string;
  freshness: FreshnessLabel;
  freshnessWindowDays: number;
  lastVerifiedAt: string | null;
  warning: string | null;
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
};

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
): ClaimCitationStatus {
  const hasSource = claim.sources.length > 0;
  const hasVerificationEvent = claim.verification_events.some((event) =>
    event.new_status === "verified" || event.event_type === "source_verified",
  );
  const hasVerifiedValue = Boolean(claim.claim_value?.trim()) && claim.claim_value !== UNKNOWN_FACT_TEXT;
  const isCitationReady =
    claim.status === "verified" &&
    claim.confidence !== "low" &&
    hasVerifiedValue &&
    hasSource &&
    hasVerificationEvent &&
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
    };
  }

  return {
    isCitationReady,
    label: "unverified",
    reason: "requires verified status, non-low confidence, source, verification event, and last_verified_at",
    freshness: "unknown",
    freshnessWindowDays: ttlDays,
    lastVerifiedAt: claim.last_verified_at ?? null,
    warning: null,
  };
}

export function getDocumentCitationStatus(
  bundle: RegistryDocumentBundle,
  ttlDays: number = getFreshnessWindowDays(bundle.document.category || bundle.entity.type),
  now: Date = new Date(),
): DocumentCitationStatus {
  const claimStatuses = bundle.claims.map((claim) => ({ claim, status: getClaimCitationStatus(claim, ttlDays, now) }));
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
  const freshness: FreshnessLabel = !isVerifiedDocument
    ? "unknown"
    : isStale(oldestVerifiedAt, ttlDays, now)
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
    freshnessWindowDays: ttlDays,
    staleClaims: claimStatuses
      .filter(({ status }) => status.isCitationReady && status.freshness === "stale")
      .map(({ claim }) => ({ claimId: claim.id, fieldPath: claim.field_path, lastVerifiedAt: claim.last_verified_at ?? null })),
  };
}

export function getCanonicalDirectAnswer(bundle: RegistryDocumentBundle): string {
  const readyClaim = bundle.claims.find((claim) => getClaimCitationStatus(claim).isCitationReady);
  return readyClaim?.claim_value ?? UNKNOWN_FACT_TEXT;
}
