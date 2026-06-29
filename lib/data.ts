import { allRegistryBundles } from "./seed-data";
import { verifiedBundles } from "./verified-claims";
import { getClaimCitationStatus, getDocumentCitationStatus } from "./citation-status";
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
  return getClaimCitationStatus(claim).isCitationReady;
}

export function isVerifiedDocumentBundle(bundle: RegistryDocumentBundle): boolean {
  return getDocumentCitationStatus(bundle).isVerifiedDocument;
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
