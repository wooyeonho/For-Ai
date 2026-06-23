import { allRegistryBundles } from "./seed-data";
import { verifiedBundles } from "./verified-claims";
import type { Document, RegistryDocumentBundle } from "./types";

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
