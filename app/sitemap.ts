import type { MetadataRoute } from "next";
import { seedRegistryBundle } from "../lib/seed-data";
import { getRegistryDocumentPaths } from "../lib/seo";
import { absoluteUrl } from "../lib/urls";

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = getRegistryDocumentPaths(seedRegistryBundle);

  return [
    {
      url: absoluteUrl("/"),
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: absoluteUrl("/goal"),
      changeFrequency: "weekly",
      priority: 0.6,
    },
    {
      url: paths.canonicalUrl,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: paths.rawMarkdownUrl,
      changeFrequency: "weekly",
      priority: 0.6,
    },
  ];
}
