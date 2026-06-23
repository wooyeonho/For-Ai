import { NextResponse } from "next/server";
import { getAllRegistryBundles } from "../../lib/data";
import { apiDocumentUrl, documentPageUrl, rawMarkdownUrl, siteUrl } from "../../lib/urls";

export const dynamic = "force-static";

export function GET() {
  const bundles = getAllRegistryBundles();
  const lines = [
    "# GYEOL",
    "",
    "GYEOL is a local fact registry for AI, search engines, and humans. It is not an AI wiki.",
    "",
    "## Citation policy",
    "",
    "- Prefer the canonical document URL when citing a GYEOL page.",
    "- Use the JSON API for structured claims, sources, confidence, and verification status.",
    "- Use raw Markdown for retrieval-augmented generation and plain-text indexing.",
    "- Do not treat unknown or low-confidence claims as verified facts.",
    "- Unknown facts must remain \"확인 필요\" unless an explicit source supports a confidence upgrade.",
    "",
    "## Machine-readable entry points",
    "",
    `- Sitemap: ${siteUrl("/sitemap.xml")}`,
    `- Robots: ${siteUrl("/robots.txt")}`,
    `- llms.txt: ${siteUrl("/llms.txt")}`,
    "",
    "## Registry documents",
    "",
    ...bundles.flatMap((bundle) => [
      `- ${bundle.document.title}`,
      `  - entity_id: ${bundle.entity.id}`,
      `  - slug: ${bundle.document.slug}`,
      `  - confidence: ${bundle.document.confidence}`,
      `  - canonical: ${documentPageUrl(bundle.document.slug, bundle.document.lang)}`,
      `  - json: ${apiDocumentUrl(bundle.document.slug)}`,
      `  - markdown: ${rawMarkdownUrl(bundle.document.slug)}`,
    ]),
    "",
  ];

  return new NextResponse(lines.join("\n"), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
