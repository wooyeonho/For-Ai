import type { ClaimWithSources, RegistryDocumentBundle, UpdateFrequency } from "./types";

export const UNKNOWN_FACT_TEXT = "확인 필요";

// Facts decay. A verified claim that hasn't been re-checked in this window is
// flagged "stale" so AI consumers and admins can prioritise re-verification.
export const FRESHNESS_TTL_DAYS = 180;

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

export type FreshnessLabel = "fresh" | "stale" | "unknown";

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
  label: "verified" | "unverified";
  reason: string;
};

export type DocumentCitationStatus = {
  verifiedClaims: number;
  unverifiedClaims: number;
  totalClaims: number;
  label: "verified" | "unverified";
  isVerifiedDocument: boolean;
  freshness: FreshnessLabel;
  oldestVerifiedAt: string | null;
};

export function getClaimCitationStatus(claim: ClaimWithSources): ClaimCitationStatus {
  const hasSource = claim.sources.length > 0;
  const hasScope = Boolean(claim.country?.trim()) && Boolean(claim.jurisdiction?.trim());
  const hasRequiredDisclaimer = claim.risk_tier !== "high" || claim.disclaimer_type !== "none";
  const hasVerificationEvent =
    claim.status === "verified" ||
    claim.verification_events.some((event) =>
      event.new_status === "verified" || event.event_type === "source_verified",
    );
  const hasVerifiedValue = Boolean(claim.claim_value?.trim()) && claim.claim_value !== UNKNOWN_FACT_TEXT;
  const isCitationReady =
    claim.status === "verified" &&
    claim.confidence !== "low" &&
    hasVerifiedValue &&
    hasSource &&
    hasVerificationEvent &&
    hasScope &&
    hasRequiredDisclaimer &&
    Boolean(claim.last_verified_at);

  if (isCitationReady) {
    return { isCitationReady, label: "verified", reason: "verified claim with source and verification event" };
  }

  return {
    isCitationReady,
    label: "unverified",
    reason: "requires verified status, non-low confidence, source, verification event, country/jurisdiction scope, required disclaimer, and last_verified_at",
  };
}

export function getDocumentCitationStatus(
  bundle: RegistryDocumentBundle,
  ttlDays?: number,
): DocumentCitationStatus {
  const claimStatuses = bundle.claims.map((claim) => ({ claim, status: getClaimCitationStatus(claim) }));
  const verifiedClaims = claimStatuses.filter(({ status }) => status.isCitationReady).length;
  const totalClaims = bundle.claims.length;
  const unverifiedClaims = totalClaims - verifiedClaims;
  // A document is citable only when a human has approved it (status verified/
  // published) AND every claim is citation-ready. Claim-level verification alone
  // is not enough — "human approval before verified" (principle #6). Unapproved
  // docs (ai_draft, needs_review) stay discoverable but are never can_cite=true.
  const isHumanApproved = bundle.document.status === "verified" || bundle.document.status === "published";
  const isVerifiedDocument = isHumanApproved && totalClaims > 0 && verifiedClaims === totalClaims;

  // Freshness is bound by the oldest verification among citation-ready claims:
  // if the weakest link is stale, the citable answer is stale.
  const readyDates = claimStatuses
    .filter(({ status }) => status.isCitationReady)
    .map(({ claim }) => claim.last_verified_at)
    .filter((value): value is string => Boolean(value) && !Number.isNaN(Date.parse(value as string)));
  const oldestVerifiedAt = readyDates.length > 0
    ? readyDates.reduce((oldest, current) => (Date.parse(current) < Date.parse(oldest) ? current : oldest))
    : null;
  const effectiveTtlDays = ttlDays ?? getBundleFreshnessTtlDays(bundle);
  const freshness: FreshnessLabel = !isVerifiedDocument
    ? "unknown"
    : isStale(oldestVerifiedAt, effectiveTtlDays)
      ? "stale"
      : "fresh";

  return {
    verifiedClaims,
    unverifiedClaims,
    totalClaims,
    label: isVerifiedDocument ? "verified" : "unverified",
    isVerifiedDocument,
    freshness,
    oldestVerifiedAt,
  };
}

export function getCanonicalDirectAnswer(bundle: RegistryDocumentBundle): string {
  const readyClaim = bundle.claims.find((claim) => getClaimCitationStatus(claim).isCitationReady);
  return readyClaim?.claim_value ?? UNKNOWN_FACT_TEXT;
}
