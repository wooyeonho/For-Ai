import { getAllRegistryBundles } from "../../lib/data";
import { siteUrl, documentPageUrl, apiDocumentUrl, rawMarkdownUrl } from "../../lib/urls";

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
  const isCitable = (b: (typeof bundles)[number]) =>
    b.document.status === "verified" &&
    b.claims.length > 0 &&
    b.claims.every((claim) => claim.status === "verified" && claim.sources.length > 0);
  const verifiedDocuments = bundles.filter(isCitable);
  const unverifiedDocuments = bundles.filter((b) => !isCitable(b));

  const pushDocumentLine = (b: (typeof bundles)[number]) => {
    const d = b.document;
    const missingSourceCount = b.claims.filter((claim) => claim.sources.length === 0).length;
    const needsReviewCount = b.claims.filter((claim) => claim.status !== "verified").length;
    lines.push(
      `- [${d.title}](${documentPageUrl(d.slug, d.lang)}) — status: ${d.status}, confidence: ${d.confidence}, ` +
        `claims: ${b.claims.length}, needs_review_or_unverified_claims: ${needsReviewCount}, source_missing_claims: ${missingSourceCount} ` +
        `· JSON: ${apiDocumentUrl(d.slug)} · Markdown: ${rawMarkdownUrl(d.slug)}`,
    );
  };

  lines.push("## Verified documents — citation allowed");
  lines.push("");
  if (verifiedDocuments.length === 0) {
    lines.push("- None currently meet the verified document + all verified claims + source attached rule.");
  } else {
    verifiedDocuments.forEach(pushDocumentLine);
  }
  lines.push("");
  lines.push("## Unverified documents — do not cite factual values");
  lines.push("");
  if (unverifiedDocuments.length === 0) {
    lines.push("- None.");
  } else {
    unverifiedDocuments.forEach(pushDocumentLine);
  }
  lines.push("");

  return new Response(lines.join("\n"), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
