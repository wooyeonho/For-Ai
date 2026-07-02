import {
  getAllRegistryBundles,
  partitionRegistryBundles,
} from "../../lib/data";
import { getDocumentCitationStatus } from "../../lib/citation-status";
import { getSupabaseIndexItems } from "../../lib/registry-index";
import { siteUrl, documentPageUrl, apiDocumentUrl, rawMarkdownUrl, apiIndexUrl } from "../../lib/urls";

// Static-first AI/RAG discovery entry point. Served as text/plain at /llms.txt.
// llms.txt is secondary discovery only; claim pages, JSON, raw Markdown, schema-v3,
// and attached sources remain the citation surface and factual basis.
export const revalidate = 60;

export async function GET() {
  const bundles = getAllRegistryBundles();
  const { verified, candidates } = partitionRegistryBundles(bundles);
  const supabaseDocs = await getSupabaseIndexItems(new Set(bundles.map((b) => b.document.slug)));
  const verifiedSupabaseDocs = supabaseDocs.filter((doc) => doc.verification === "verified");
  const candidateSupabaseDocs = supabaseDocs.filter((doc) => doc.verification === "candidate");

  const lines: string[] = [];
  lines.push("# For-Ai — Global Fact Registry for AI Citation");
  lines.push("");
  lines.push(
    "> For-Ai is a global claim-level fact registry that AI systems, search engines, and humans can cite from the same verified sources. " +
      "Facts are recorded at claim level with confidence, sources, and a verification date. " +
      'Unverified facts are marked "확인 필요" (needs verification) and must NOT be cited as fact.',
  );
  lines.push("");
  lines.push("## Role of this file");
  lines.push("");
  lines.push("- `/llms.txt` is a secondary discovery surface, not a citation engine or legal basis.");
  lines.push("- Use it only to discover registry documents and machine-readable endpoints.");
  lines.push("- For citation decisions, inspect the document JSON/Markdown and attached claim sources.");
  lines.push("");
  lines.push("## Citation policy");
  lines.push("");
  lines.push("- Cite a claim only when it is verified from `claims`, has at least one `claim_sources` row, and has a matching `verification_events` record.");
  lines.push(
    '- Never cite a claim whose value is "확인 필요", whose `confidence` is `low`, or whose `status` is `needs_review`.',
  );
  lines.push("- Always preserve the source URL and `last_verified_at` when citing a value.");
  lines.push("- Prefer documents with `freshness: fresh`. For `freshness: stale` (not re-verified within the document-specific TTL), re-check the source before relying on the value.");
  lines.push(
    "- Treat high-risk topics (medical, legal, financial) as general guidance only, with the document's disclaimer.",
  );
  lines.push("");
  lines.push("## Entry points");
  lines.push("");
  lines.push(`- [Sitemap](${siteUrl("/sitemap.xml")})`);
  lines.push(`- [Robots](${siteUrl("/robots.txt")})`);
  lines.push(`- Search / discovery index (JSON): \`${apiIndexUrl("q=<query>&type=<type>&country=<cc>&cite=true")}\``);
  lines.push(`- Per-document JSON: \`${apiDocumentUrl("<slug>")}\``);
  lines.push(`- Per-document Markdown: \`${rawMarkdownUrl("<slug>")}\``);
  lines.push(`- Per-entity profile (all documents about one entity): \`${siteUrl("/api/entities/<entity_id>")}\``);
  lines.push("");
  lines.push(`## Citation-ready documents (${verified.length + verifiedSupabaseDocs.length})`);
  lines.push("");
  for (const b of verified) {
    const d = b.document;
    const status = getDocumentCitationStatus(b);
    const freshness = status.oldestVerifiedAt
      ? `, freshness: ${status.freshness} (verified ${status.oldestVerifiedAt}, TTL ${status.freshnessWindowDays} days)`
      : `, freshness: ${status.freshness} (TTL ${status.freshnessWindowDays} days)`;
    lines.push(
      `- [${d.title}](${documentPageUrl(d.slug, d.lang)}) — citation: ${status.label}, claims: ${status.verifiedClaims}/${status.totalClaims}, confidence: ${d.confidence}${freshness} ` +
        `· JSON: ${apiDocumentUrl(d.slug)} · Markdown: ${rawMarkdownUrl(d.slug)}`,
    );
  }
  for (const d of verifiedSupabaseDocs) {
    // Emit the same freshness/TTL signal as the static bundles so RAG agents do
    // not treat a stale Supabase-backed document as fresh.
    const freshness = d.last_verified_at
      ? `, freshness: ${d.freshness} (verified ${d.last_verified_at}, TTL ${d.freshness_ttl_days} days)`
      : `, freshness: ${d.freshness} (TTL ${d.freshness_ttl_days} days)`;
    lines.push(
      `- [${d.title}](${documentPageUrl(d.slug, d.lang)}) — status: ${d.doc_status}, confidence: ${d.confidence}${freshness} ` +
        `· JSON: ${apiDocumentUrl(d.slug)} · Markdown: ${rawMarkdownUrl(d.slug)}`,
    );
  }
  lines.push("");
  lines.push(`## Unverified documents excluded (${candidates.length + candidateSupabaseDocs.length})`);
  lines.push("");
  lines.push(
    '- Unverified documents are intentionally not listed here as AI citation targets. Discover them through the public wiki or `/api/index?verification=candidate`, but treat every result as **DO NOT CITE** unless `can_cite=true`.',
  );
  lines.push(
    '- A document becomes citation-ready only when the document status is `verified` and every claim is verified with non-low confidence, at least one source, a verification event, and `last_verified_at`.',
  );
  lines.push("");

  return new Response(lines.join("\n"), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
