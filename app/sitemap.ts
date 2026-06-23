import type { MetadataRoute } from "next";
import { getAllRegistryBundles } from "../lib/data";
import { getSupabaseDocumentIndex } from "../lib/supabase-documents";
import { siteUrl, documentPageUrl } from "../lib/urls";

type SitemapDocument = {
  slug: string;
  lang: string;
  lastModified: string;
  isStaticVerified: boolean;
};

function documentKey(slug: string, lang: string): string {
  return `${lang}:${slug}`;
}

function documentLastModified(updatedAt: string | null, lastVerifiedAt: string | null): string {
  return updatedAt ?? lastVerifiedAt ?? new Date().toISOString();
}

function isNewer(candidate: string, current: string): boolean {
  return new Date(candidate).getTime() > new Date(current).getTime();
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const documentsByKey = new Map<string, SitemapDocument>();

  for (const bundle of getAllRegistryBundles()) {
    const document = bundle.document;
    documentsByKey.set(documentKey(document.slug, document.lang), {
      slug: document.slug,
      lang: document.lang,
      lastModified: documentLastModified(document.updated_at, document.last_verified_at),
      isStaticVerified: document.status === "verified",
    });
  }

  const supabaseDocuments = await getSupabaseDocumentIndex();

  for (const document of supabaseDocuments) {
    const key = documentKey(document.slug, document.lang);
    const lastModified = documentLastModified(document.updated_at, document.last_verified_at);
    const current = documentsByKey.get(key);

    if (!current) {
      documentsByKey.set(key, {
        slug: document.slug,
        lang: document.lang,
        lastModified,
        isStaticVerified: false,
      });
      continue;
    }

    // Deduplication rule: static verified bundles are canonical; otherwise the newer source wins.
    if (!current.isStaticVerified && isNewer(lastModified, current.lastModified)) {
      documentsByKey.set(key, {
        slug: document.slug,
        lang: document.lang,
        lastModified,
        isStaticVerified: false,
      });
    }
  }

  const documentPages = Array.from(documentsByKey.values()).map((document) => ({
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
