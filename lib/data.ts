import { allRegistryBundles } from "./seed-data";
import { verifiedBundles } from "./verified-claims";
import type { Document, RegistryDocumentBundle } from "./types";

const combinedBundles: RegistryDocumentBundle[] = [
  ...verifiedBundles,
  ...allRegistryBundles,
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
