import { allRegistryBundles } from "./seed-data";
import type { Document, RegistryDocumentBundle } from "./types";

export function getRegistryBundleBySlug(slug: string): RegistryDocumentBundle | null {
  return allRegistryBundles.find((b) => b.document.slug === slug) ?? null;
}

export function getDocumentBySlug(slug: string): Document | null {
  return getRegistryBundleBySlug(slug)?.document ?? null;
}

export function getAllRegistryBundles(): RegistryDocumentBundle[] {
  return allRegistryBundles;
}
