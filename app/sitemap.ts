import type { MetadataRoute } from "next";
import { getAllRegistryBundles } from "../lib/data";
import { getRegistryIndex } from "../lib/registry-index";
import { getDocumentCitationStatus } from "../lib/citation-status";
import { getAllEntityRefs } from "../lib/entity-profile";
import { siteUrl, documentPageUrl, entityPageUrl } from "../lib/urls";
import { normalizeCitationSurface } from "../lib/render";
import { SUPPORTED_LOCALES } from "../lib/i18n";
import { buildDocumentAlternateLanguages } from "../lib/seo";

type DocumentSitemapEntry = {
  slug: string;
  lang: string;
  lastModified: string;
  canCite: boolean;
  sourceCount: number;
};

function getStaticDocumentEntries(): DocumentSitemapEntry[] {
  return getAllRegistryBundles().map((bundle) => {
    const citationStatus = getDocumentCitationStatus(bundle);
    const normalized = normalizeCitationSurface(bundle);
    return {
      slug: normalized.sitemap.slug,
      lang: bundle.document.lang,
      lastModified: citationStatus.oldestVerifiedAt ?? normalized.sitemap.last_verified_at ?? bundle.document.last_verified_at ?? bundle.document.updated_at ?? new Date().toISOString(),
      canCite: citationStatus.isVerifiedDocument,
      sourceCount: bundle.claims.reduce((count, claim) => count + claim.sources.length, 0),
    };
  });
}

async function getSupabaseDocumentEntries(): Promise<DocumentSitemapEntry[]> {
  const documents = await getRegistryIndex({ cite: true });

  return documents
    .filter((document) => document.source === "supabase")
    .map((document) => ({
      slug: document.slug,
      lang: document.lang,
      lastModified: document.last_verified_at ?? document.updated_at ?? new Date().toISOString(),
      canCite: true,
      sourceCount: 0,
    }));
}

function mergeDocumentEntries(entries: DocumentSitemapEntry[]): DocumentSitemapEntry[] {
  const bySlug = new Map<string, DocumentSitemapEntry>();

  for (const entry of entries) {
    const existing = bySlug.get(entry.slug);
    if (!existing) {
      bySlug.set(entry.slug, entry);
      continue;
    }

    bySlug.set(entry.slug, {
      ...existing,
      lastModified: existing.lastModified > entry.lastModified ? existing.lastModified : entry.lastModified,
      canCite: existing.canCite || entry.canCite,
      sourceCount: Math.max(existing.sourceCount, entry.sourceCount),
    });
  }

  return Array.from(bySlug.values());
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticDocumentEntries = getStaticDocumentEntries();
  let documentEntries = staticDocumentEntries;

  try {
    documentEntries = mergeDocumentEntries([...staticDocumentEntries, ...(await getSupabaseDocumentEntries())]);
  } catch (error) {
    console.warn("Failed to load Supabase document index for sitemap; falling back to static sitemap.", error);
  }

  const documentPages = documentEntries.flatMap((document) =>
    SUPPORTED_LOCALES.map((locale) => ({
      url: documentPageUrl(document.slug, locale),
      lastModified: document.lastModified,
      changeFrequency: "weekly" as const,
      priority: document.canCite ? 0.9 : document.sourceCount > 0 ? 0.7 : 0.5,
      alternates: {
        languages: buildDocumentAlternateLanguages(document.slug),
      },
    })),
  );

  let entityPages: MetadataRoute.Sitemap = [];
  try {
    const refs = await getAllEntityRefs();
    entityPages = refs.map((ref) => ({
      url: entityPageUrl(ref.id, ref.lang),
      lastModified: new Date().toISOString(),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));
  } catch (error) {
    console.warn("Failed to load entity refs for sitemap; skipping entity pages.", error);
  }

  return [
    {
      url: siteUrl("/"),
      lastModified: new Date().toISOString(),
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: siteUrl("/llms.txt"),
      lastModified: new Date().toISOString(),
      changeFrequency: "weekly",
      priority: 0.5,
    },
    ...documentPages,
    ...entityPages,
  ];
}
