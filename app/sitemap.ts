import type { MetadataRoute } from "next";
import { getAllRegistryBundles } from "../lib/data";
import { getPublishedVerifiedDocumentIndexFromSupabase } from "../lib/supabase-index";
import { getAllEntityRefs } from "../lib/entity-profile";
import { siteUrl, documentPageUrl, entityPageUrl } from "../lib/urls";
import { getDocumentCitationStatus } from "../lib/citation-status";
import { normalizeCitationSurface } from "../lib/render";

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
  const documents = await getPublishedVerifiedDocumentIndexFromSupabase();

  return documents.map((document) => ({
    slug: document.slug,
    lang: document.lang,
    lastModified: document.last_verified_at ?? document.updated_at ?? new Date().toISOString(),
    canCite: true,
    sourceCount: 0,
  }));
}

function mergeDocumentEntries(entries: DocumentSitemapEntry[]): DocumentSitemapEntry[] {
  const byPath = new Map<string, DocumentSitemapEntry>();

  for (const entry of entries) {
    byPath.set(`${entry.lang}/${entry.slug}`, entry);
  }

  return Array.from(byPath.values());
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticDocumentEntries = getStaticDocumentEntries();
  let documentEntries = staticDocumentEntries;

  try {
    documentEntries = mergeDocumentEntries([...staticDocumentEntries, ...(await getSupabaseDocumentEntries())]);
  } catch (error) {
    console.warn("Failed to load Supabase document index for sitemap; falling back to static sitemap.", error);
  }

  const documentPages = documentEntries.map((document) => ({
    url: documentPageUrl(document.slug, document.lang),
    lastModified: document.lastModified,
    changeFrequency: "weekly" as const,
    priority: document.canCite ? 0.9 : document.sourceCount > 0 ? 0.7 : 0.5,
  }));

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
