import type { ClaimWithSources, RegistryDocumentBundle } from "./types";

export const UNKNOWN_FACT_TEXT = "확인 필요";

// Facts decay. A verified claim that hasn't been re-checked in this window is
// flagged "stale" so AI consumers and admins can prioritise re-verification.
export const FRESHNESS_TTL_DAYS = 180;

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
  ttlDays: number = FRESHNESS_TTL_DAYS,
  now: Date = new Date(),
): boolean {
  const age = ageInDays(iso, now);
  if (age === null) return true; // no verification date → treat as not-fresh
  return age > ttlDays;
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

export function getClaimCitationStatus(claim: ClaimWithSources): ClaimCitationStatus {
  const validation = assertVerifiedClaimReady(claim);

  if ("violations" in validation) {
    return {
      isCitationReady: false,
      label: "unverified",
      reason: `requires verified status, medium/high confidence, non-placeholder value, source, verification event, and last_verified_at (${validation.violations.join("; ")})`,
    };
  }

  return { isCitationReady: true, label: "verified", reason: "verified claim with source and verification event" };
}

export function getDocumentCitationStatus(
  bundle: RegistryDocumentBundle,
  ttlDays: number = FRESHNESS_TTL_DAYS,
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
  const freshness: FreshnessLabel = !isVerifiedDocument
    ? "unknown"
    : isStale(oldestVerifiedAt, ttlDays)
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
