import { getAllRegistryBundles } from "../../lib/data";
import { siteUrl, documentPageUrl, apiDocumentUrl, rawMarkdownUrl } from "../../lib/urls";
import { isDocumentCitable } from "../../lib/citation-status";

// Static-first AI/RAG entry point. Served as text/plain at /llms.txt.
export const dynamic = "force-static";

export function GET() {
  const bundles = getAllRegistryBundles();

  const lines: string[] = [];
  lines.push("# GYEOL — Local Fact Registry");
  lines.push("");
  lines.push(
    "> GYEOL is a local fact registry for AI systems, search engines, and humans. " +
      "Facts are recorded at claim level with confidence, sources, and a verification date. " +
      'Unverified facts are marked "확인 필요" (needs verification) and must NOT be cited as fact.',
  );
  lines.push("");
  lines.push("## Citation policy");
  lines.push("");
  lines.push("- Cite a claim only when its `status` is `verified` and it has at least one source.");
  lines.push(
    '- Never cite a claim whose value is "확인 필요", whose `confidence` is `low`, or whose `status` is `needs_review`.',
  );
  lines.push("- Always preserve the source URL and `last_verified_at` when citing a value.");
  lines.push(
    "- Treat high-risk topics (medical, legal, financial) as general guidance only, with the document's disclaimer.",
  );
  lines.push("");
  lines.push("## Entry points");
  lines.push("");
  lines.push(`- [Sitemap](${siteUrl("/sitemap.xml")})`);
  lines.push(`- [Robots](${siteUrl("/robots.txt")})`);
  lines.push(`- Per-document JSON: \`${apiDocumentUrl("<slug>")}\``);
  lines.push(`- Per-document Markdown: \`${rawMarkdownUrl("<slug>")}\``);
  lines.push("");
  const verifiedBundles = bundles.filter(isDocumentCitable);
  const unverifiedBundles = bundles.filter((bundle) => !isDocumentCitable(bundle));

  lines.push("## Verified documents — 인용 가능");
  lines.push("");
  if (verifiedBundles.length === 0) {
    lines.push("- None yet. Do not infer that unlisted documents are citable.");
  }
  for (const b of verifiedBundles) {
    const d = b.document;
    lines.push(
      `- [${d.title}](${documentPageUrl(d.slug, d.lang)}) — status: ${d.status}, confidence: ${d.confidence} ` +
        `· JSON: ${apiDocumentUrl(d.slug)} · Markdown: ${rawMarkdownUrl(d.slug)}`,
    );
  }
  lines.push("");
  lines.push("## Unverified documents — 사실값 인용 금지 / 확인 필요");
  lines.push("");
  if (unverifiedBundles.length === 0) {
    lines.push("- None.");
  }
  for (const b of unverifiedBundles) {
    const d = b.document;
    const missingSourceCount = b.claims.filter((claim) => claim.sources.length === 0).length;
    const needsReviewCount = b.claims.filter((claim) => claim.status === "needs_review").length;
    lines.push(
      `- [${d.title}](${documentPageUrl(d.slug, d.lang)}) — status: ${d.status}, confidence: ${d.confidence}, ` +
        `needs_review claims: ${needsReviewCount}, claims without sources: ${missingSourceCount} ` +
        `· JSON: ${apiDocumentUrl(d.slug)} · Markdown: ${rawMarkdownUrl(d.slug)}`,
    );
  }
  lines.push("");

  return new Response(lines.join("\n"), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
