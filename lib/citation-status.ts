import type { ClaimWithSources, RegistryDocumentBundle } from "./types";

export const UNKNOWN_FACT_TEXT = "확인 필요";

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
};

export function getClaimCitationStatus(claim: ClaimWithSources): ClaimCitationStatus {
  const hasSource = claim.sources.length > 0;
  const hasVerificationEvent = claim.verification_events.some((event) =>
    event.new_status === "verified" || event.event_type === "source_verified",
  );
  const hasVerifiedValue = claim.claim_value !== UNKNOWN_FACT_TEXT;
  const isCitationReady =
    claim.status === "verified" &&
    claim.confidence !== "low" &&
    hasVerifiedValue &&
    hasSource &&
    hasVerificationEvent &&
    Boolean(claim.last_verified_at);

  if (isCitationReady) {
    return { isCitationReady, label: "verified", reason: "verified claim with source and verification event" };
  }

  return {
    isCitationReady,
    label: "unverified",
    reason: "requires verified status, non-low confidence, source, verification event, and last_verified_at",
  };
}

export function getDocumentCitationStatus(bundle: RegistryDocumentBundle): DocumentCitationStatus {
  const claimStatuses = bundle.claims.map(getClaimCitationStatus);
  const verifiedClaims = claimStatuses.filter((status) => status.isCitationReady).length;
  const totalClaims = bundle.claims.length;
  const unverifiedClaims = totalClaims - verifiedClaims;
  const isVerifiedDocument = totalClaims > 0 && verifiedClaims === totalClaims;

  return {
    verifiedClaims,
    unverifiedClaims,
    totalClaims,
    label: isVerifiedDocument ? "verified" : "unverified",
    isVerifiedDocument,
  };
}

export function getCanonicalDirectAnswer(bundle: RegistryDocumentBundle): string {
  const readyClaim = bundle.claims.find((claim) => getClaimCitationStatus(claim).isCitationReady);
  return readyClaim?.claim_value ?? UNKNOWN_FACT_TEXT;
}
