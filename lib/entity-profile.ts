import { createClient } from "@supabase/supabase-js";
import { getAllRegistryBundles } from "./data";
import { getRegistryBundleFromSupabase } from "./supabase-documents";
import { getDocumentCitationStatus, isStale, type FreshnessLabel } from "./citation-status";
import { DEFAULT_LOCALE } from "./i18n/locales";
import type { Entity, RegistryDocumentBundle } from "./types";

// An entity profile aggregates EVERY document/claim For-Ai holds about one entity
// (a place, institution, product, service…) into a single trust view — for humans
// to judge credibility and for AI to cite at the entity level. citable status is
// derived from the same getDocumentCitationStatus() used everywhere else.

export type EntityProfileSummary = {
  total_documents: number;
  citable_documents: number;
  verified_claims: number;
  total_claims: number;
  freshness: FreshnessLabel;
};

export type EntityProfile = {
  entity: Entity;
  documents: RegistryDocumentBundle[];
  summary: EntityProfileSummary;
};

async function getSupabaseEntityBundles(
  entityId: string,
  excludeSlugs: Set<string>,
): Promise<RegistryDocumentBundle[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];

  try {
    const sb = createClient(url, key);
    const { data } = await sb
      .from("documents")
      .select("slug")
      .eq("entity_id", entityId)
      .in("status", ["published", "verified"]);

    const slugs = ((data ?? []) as { slug: string | null }[])
      .map((row) => row.slug)
      .filter((slug): slug is string => slug != null && slug.length > 0 && !excludeSlugs.has(slug));

    // Reuse the tested row→bundle mapping (loads claims/sources/events) per slug.
    const bundles = await Promise.all(slugs.map((slug) => getRegistryBundleFromSupabase(slug)));
    return bundles.filter((b): b is RegistryDocumentBundle => b !== null);
  } catch {
    return [];
  }
}

function summarize(documents: RegistryDocumentBundle[]): EntityProfileSummary {
  let citable = 0;
  let verifiedClaims = 0;
  let totalClaims = 0;
  let anyStale = false;

  for (const bundle of documents) {
    const status = getDocumentCitationStatus(bundle);
    verifiedClaims += status.verifiedClaims;
    totalClaims += status.totalClaims;
    if (status.isVerifiedDocument) {
      citable += 1;
      if (isStale(status.oldestVerifiedAt)) anyStale = true;
    }
  }

  const freshness: FreshnessLabel = citable === 0 ? "unknown" : anyStale ? "stale" : "fresh";

  return {
    total_documents: documents.length,
    citable_documents: citable,
    verified_claims: verifiedClaims,
    total_claims: totalClaims,
    freshness,
  };
}

export async function getEntityProfile(entityId: string): Promise<EntityProfile | null> {
  const staticBundles = getAllRegistryBundles().filter((b) => b.entity.id === entityId);
  const supabaseBundles = await getSupabaseEntityBundles(
    entityId,
    new Set(staticBundles.map((b) => b.document.slug)),
  );

  const documents = [...staticBundles, ...supabaseBundles].sort((a, b) => {
    const av = getDocumentCitationStatus(a).isVerifiedDocument ? 0 : 1;
    const bv = getDocumentCitationStatus(b).isVerifiedDocument ? 0 : 1;
    return av - bv;
  });

  if (documents.length === 0) return null;

  return {
    entity: documents[0].entity,
    documents,
    summary: summarize(documents),
  };
}

// Lightweight list of all known entity ids (static + Supabase) for sitemap/index.
export async function getAllEntityRefs(): Promise<{ id: string; lang: string }[]> {
  const byId = new Map<string, string>();
  for (const b of getAllRegistryBundles()) {
    if (!byId.has(b.entity.id)) byId.set(b.entity.id, b.document.lang);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key) {
    try {
      const sb = createClient(url, key);
      const { data } = await sb
        .from("documents")
        .select("entity_id, lang")
        .in("status", ["published", "verified"]);
      for (const row of (data ?? []) as { entity_id: string | null; lang: string | null }[]) {
        if (row.entity_id && !byId.has(row.entity_id)) byId.set(row.entity_id, row.lang ?? DEFAULT_LOCALE);
      }
    } catch {
      // fall back to static-only refs
    }
  }

  return [...byId.entries()].map(([id, lang]) => ({ id, lang }));
}
