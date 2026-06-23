import type { MetadataRoute } from "next";
import { getAllRegistryBundles } from "../lib/data";
import { siteUrl, documentPageUrl } from "../lib/urls";

export default function sitemap(): MetadataRoute.Sitemap {
  const bundles = getAllRegistryBundles();

  const documentPages = bundles.map((bundle) => ({
    url: documentPageUrl(bundle.document.slug, bundle.document.lang),
    lastModified: bundle.document.updated_at ?? new Date().toISOString(),
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
      priority: 0.7,
    },
    ...documentPages,
  ];
}
