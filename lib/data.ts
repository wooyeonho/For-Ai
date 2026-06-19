import { seedRegistryBundle } from "./seed-data";
import type { Document, RegistryDocumentBundle } from "./types";

export function getRegistryBundleBySlug(slug: string): RegistryDocumentBundle | null {
  if (slug !== seedRegistryBundle.document.slug) {
    return null;
  }

  return seedRegistryBundle;
}

export function getDocumentBySlug(slug: string): Document | null {
  return getRegistryBundleBySlug(slug)?.document ?? null;
}

export function getAllRegistryBundles(): RegistryDocumentBundle[] {
  return [seedRegistryBundle];
}
