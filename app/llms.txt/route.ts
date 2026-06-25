import { DEFAULT_LOCALE } from "@/lib/i18n";
import { createClient } from "@supabase/supabase-js";
import {
  getAllRegistryBundles,
  partitionRegistryBundles,
} from "../../lib/data";
import { getDocumentCitationStatus } from "../../lib/citation-status";
import { siteUrl, documentPageUrl, apiDocumentUrl, rawMarkdownUrl } from "../../lib/urls";

// Static-first AI/RAG discovery entry point. Served as text/plain at /llms.txt.
// llms.txt is secondary discovery only; claim pages, JSON, raw Markdown, schema-v3,
// and attached sources remain the citation surface and factual basis.
export const revalidate = 60;

type SupabaseIndexDoc = {
  slug: string;
  title: string;
  lang: string;
  status: string;
  confidence: string;
  verification: "verified" | "candidate";
};

function isVerifiedSupabaseDoc(doc: {
  status?: string;
  confidence?: string;
  claims?: { status?: string; confidence?: string; claim_value?: string; claim_sources?: unknown[] }[];
}): boolean {
  const claims = doc.claims ?? [];

  return (
    (doc.status === "published" || doc.status === "verified") &&
    doc.confidence !== "low" &&
    claims.length > 0 &&
    claims.every(
      (claim) =>
        claim.status === "verified" &&
        claim.confidence !== "low" &&
        claim.claim_value !== "확인 필요" &&
        Array.isArray(claim.claim_sources) &&
        claim.claim_sources.length > 0,
    )
  );
}

async function getSupabaseIndexDocs(staticSlugs: Set<string>): Promise<SupabaseIndexDoc[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];

  try {
    const sb = createClient(url, key);
    const { data } = await sb
      .from("documents")
      .select("slug,title,lang,status,confidence,claims(status,confidence,claim_value,claim_sources(id))")
      .in("status", ["published", "verified", "needs_review"])
      .order("updated_at", { ascending: false })
      .limit(500);

    return ((data ?? []) as {
      slug: string;
      title: string;
      lang?: string;
      status?: string;
      confidence?: string;
      claims?: { status?: string; confidence?: string; claim_value?: string; claim_sources?: unknown[] }[];
    }[])
      .filter((doc) => doc.slug && !staticSlugs.has(doc.slug))
      .map((doc) => ({
        slug: doc.slug,
        title: doc.title,
        lang: doc.lang ?? DEFAULT_LOCALE,
        status: doc.status ?? "needs_review",
        confidence: doc.confidence ?? "low",
        verification: isVerifiedSupabaseDoc(doc) ? "verified" : "candidate",
      }));
  } catch {
    return [];
  }
}

export async function GET() {
  const bundles = getAllRegistryBundles();
  const { verified, candidates } = partitionRegistryBundles(bundles);
  const supabaseDocs = await getSupabaseIndexDocs(new Set(bundles.map((b) => b.document.slug)));
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
  lines.push("- Prefer documents with `freshness: fresh`. For `freshness: stale` (not re-verified within 180 days), re-check the source before relying on the value.");
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
  lines.push(`## Verified documents (${verified.length + verifiedSupabaseDocs.length})`);
  lines.push("");
  for (const b of verified) {
    const d = b.document;
    const status = getDocumentCitationStatus(b);
    const freshness = status.oldestVerifiedAt
      ? `, freshness: ${status.freshness} (verified ${status.oldestVerifiedAt})`
      : `, freshness: ${status.freshness}`;
    lines.push(
      `- [${d.title}](${documentPageUrl(d.slug, d.lang)}) — citation: ${status.label}, claims: ${status.verifiedClaims}/${status.totalClaims}, confidence: ${d.confidence}${freshness} ` +
        `· JSON: ${apiDocumentUrl(d.slug)} · Markdown: ${rawMarkdownUrl(d.slug)}`,
    );
  }
  for (const d of verifiedSupabaseDocs) {
    lines.push(
      `- [${d.title}](${documentPageUrl(d.slug, d.lang)}) — status: ${d.status}, confidence: ${d.confidence} ` +
        `· JSON: ${apiDocumentUrl(d.slug)} · Markdown: ${rawMarkdownUrl(d.slug)}`,
    );
  }
  lines.push("");
  lines.push(`## Candidate / unverified documents (${candidates.length + candidateSupabaseDocs.length})`);
  lines.push("");
  lines.push('- Candidate documents are discoverable only; values marked "확인 필요" are not factual citations.');
  for (const b of candidates) {
    const d = b.document;
    lines.push(
      `- [${d.title}](${documentPageUrl(d.slug, d.lang)}) — status: ${d.status}, confidence: ${d.confidence} ` +
        `· JSON: ${apiDocumentUrl(d.slug)} · Markdown: ${rawMarkdownUrl(d.slug)}`,
    );
  }
  for (const d of candidateSupabaseDocs) {
    lines.push(
      `- [${d.title}](${documentPageUrl(d.slug, d.lang)}) — status: ${d.status}, confidence: ${d.confidence} ` +
        `· JSON: ${apiDocumentUrl(d.slug)} · Markdown: ${rawMarkdownUrl(d.slug)}`,
    );
  }
  lines.push("");

  return new Response(lines.join("\n"), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
