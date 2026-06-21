import type { MetadataRoute } from "next";
import { absoluteUrl } from "../lib/urls";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/ko/wiki/", "/api/documents/", "/raw/"],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
