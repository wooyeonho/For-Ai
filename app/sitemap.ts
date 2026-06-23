import type { MetadataRoute } from "next";
import { getAllRegistryBundles } from "../lib/data";
import { getSupabaseDocumentIndex } from "../lib/supabase-documents";
import { siteUrl, documentPageUrl } from "../lib/urls";

type SitemapDocument = {
  slug: string;
  lang: string;
  updated_at: string | null;
  last_verified_at: string | null;
  source: "static" | "supabase";
  staticStatus?: string;
};

function documentKey(slug: string, lang: string): string {
  return `${lang}:${slug}`;
}

function timestampValue(value: string | null): number {
  return value ? Date.parse(value) || 0 : 0;
}

function shouldUseSupabaseDocument(existing: SitemapDocument, supabaseDoc: SitemapDocument): boolean {
  if (existing.source !== "static") return true;
  if (existing.staticStatus === "verified") return false;

  return timestampValue(supabaseDoc.updated_at) > timestampValue(existing.updated_at);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const bundles = getAllRegistryBundles();
  const documentsByKey = new Map<string, SitemapDocument>();

  for (const bundle of bundles) {
    documentsByKey.set(documentKey(bundle.document.slug, bundle.document.lang), {
      slug: bundle.document.slug,
      lang: bundle.document.lang,
      updated_at: bundle.document.updated_at,
      last_verified_at: bundle.document.last_verified_at,
      source: "static",
      staticStatus: bundle.document.status,
    });
  }

  const supabaseDocuments = await getSupabaseDocumentIndex();
  for (const document of supabaseDocuments) {
    const key = documentKey(document.slug, document.lang);
    const supabaseDoc: SitemapDocument = {
      ...document,
      source: "supabase",
    };
    const existing = documentsByKey.get(key);

    if (!existing || shouldUseSupabaseDocument(existing, supabaseDoc)) {
      documentsByKey.set(key, supabaseDoc);
    }
  }

  const documentPages = Array.from(documentsByKey.values()).map((document) => ({
    url: documentPageUrl(document.slug, document.lang),
    lastModified: document.last_verified_at ?? document.updated_at ?? new Date().toISOString(),
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
