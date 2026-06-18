// GYEOL data access layer
// Primary API: getRegistryBundleBySlug — returns entity + document together.
// getDocumentBySlug is a convenience wrapper for page components.
// Routes must use getRegistryBundleBySlug.

import type { Entity, Document } from "./types";
import { seedEntity, seedDocument } from "./seed-data";

export type RegistryBundle = {
  entity: Entity;
  document: Document;
};

const registry: RegistryBundle[] = [
  { entity: seedEntity, document: seedDocument },
];

export function getRegistryBundleBySlug(slug: string): RegistryBundle | null {
  return registry.find((b) => b.document.slug === slug) ?? null;
}

export function getDocumentBySlug(slug: string): Document | null {
  return getRegistryBundleBySlug(slug)?.document ?? null;
}
