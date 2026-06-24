import type { MetadataRoute } from "next";
import { getAllRegistryBundles } from "../lib/data";
import { getPublishedVerifiedDocumentIndexFromSupabase } from "../lib/supabase-index";
import { siteUrl, documentPageUrl } from "../lib/urls";

type DocumentSitemapEntry = {
  slug: string;
  lang: string;
  lastModified: string;
};

function getStaticDocumentEntries(): DocumentSitemapEntry[] {
  return getAllRegistryBundles().map((bundle) => ({
    slug: bundle.document.slug,
    lang: bundle.document.lang,
    lastModified: bundle.document.updated_at ?? new Date().toISOString(),
  }));
}

async function getSupabaseDocumentEntries(): Promise<DocumentSitemapEntry[]> {
  const documents = await getPublishedVerifiedDocumentIndexFromSupabase();

  return documents.map((document) => ({
    slug: document.slug,
    lang: document.lang,
    lastModified: document.updated_at ?? document.last_verified_at ?? new Date().toISOString(),
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
    priority: 0.8,
  }));

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
  ];
}
