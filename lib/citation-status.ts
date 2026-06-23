import type { RegistryDocumentBundle } from "./types";

export function isClaimCitable(claim: RegistryDocumentBundle["claims"][number]) {
  return claim.status === "verified" && claim.sources.length > 0;
}

export function isDocumentCitable(bundle: RegistryDocumentBundle) {
  return bundle.document.status === "verified" && bundle.claims.every(isClaimCitable);
}

export function getCitationStatus(bundle: RegistryDocumentBundle) {
  const citable = isDocumentCitable(bundle);
  const missingSourceCount = bundle.claims.filter((claim) => claim.sources.length === 0).length;
  const needsReviewCount = bundle.claims.filter((claim) => claim.status === "needs_review").length;

  return {
    citable,
    label: citable ? "인용 가능" : "사실값 인용 금지 / 확인 필요",
    tone: citable ? "citable" : "blocked",
    missingSourceCount,
    needsReviewCount,
  } as const;
}
