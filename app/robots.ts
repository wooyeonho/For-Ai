import type { MetadataRoute } from "next";
import { siteUrl } from "../lib/urls";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
      },
    ],
    sitemap: siteUrl("/sitemap.xml"),
    host: new URL(siteUrl("/")).host,
  };
}
