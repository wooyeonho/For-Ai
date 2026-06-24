import { allRegistryBundles } from "./seed-data";
import { verifiedBundles } from "./verified-claims";
import type { ClaimWithSources, Document, RegistryDocumentBundle } from "./types";

const verifiedSlugs = new Set(verifiedBundles.map((b) => b.document.slug));
const combinedBundles: RegistryDocumentBundle[] = [
  ...verifiedBundles,
  ...allRegistryBundles.filter((b) => !verifiedSlugs.has(b.document.slug)),
];

export function getRegistryBundleBySlug(slug: string): RegistryDocumentBundle | null {
  return combinedBundles.find((b) => b.document.slug === slug) ?? null;
}

export function getDocumentBySlug(slug: string): Document | null {
  return getRegistryBundleBySlug(slug)?.document ?? null;
}

export function getAllRegistryBundles(): RegistryDocumentBundle[] {
  return combinedBundles;
}


export function isVerifiedClaim(claim: ClaimWithSources): boolean {
  return (
    claim.status === "verified" &&
    claim.confidence !== "low" &&
    claim.claim_value !== "확인 필요" &&
    Array.isArray(claim.sources) &&
    claim.sources.length > 0
  );
}

export function isVerifiedDocumentBundle(bundle: RegistryDocumentBundle): boolean {
  return (
    (bundle.document.status === "verified" || bundle.document.status === "published") &&
    bundle.document.confidence !== "low" &&
    bundle.claims.length > 0 &&
    bundle.claims.every(isVerifiedClaim)
  );
}

export function partitionRegistryBundles(bundles: RegistryDocumentBundle[]): {
  verified: RegistryDocumentBundle[];
  candidates: RegistryDocumentBundle[];
} {
  const verified: RegistryDocumentBundle[] = [];
  const candidates: RegistryDocumentBundle[] = [];

  for (const bundle of bundles) {
    if (isVerifiedDocumentBundle(bundle)) {
      verified.push(bundle);
    } else {
      candidates.push(bundle);
    }
  }

  return { verified, candidates };
}
