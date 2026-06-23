import { createClient } from "@supabase/supabase-js";
import { getAllRegistryBundles } from "../../lib/data";
import type { Confidence, DocumentStatus } from "../../lib/types";
import { siteUrl, documentPageUrl, apiDocumentUrl, rawMarkdownUrl } from "../../lib/urls";

// Static-first AI/RAG entry point. Served as text/plain at /llms.txt.
export const dynamic = "force-dynamic";
export const revalidate = 60;

type LlmsDocumentIndexItem = {
  slug: string;
  lang: string;
  title: string;
  status: DocumentStatus;
  confidence: Confidence;
  source: "static" | "supabase";
};

type SupabaseDocumentIndexRow = {
  slug: string | null;
  lang: string | null;
  title: string | null;
  status: string | null;
  confidence: string | null;
};

const DOCUMENT_INDEX_TIMEOUT_MS = 1500;

function toDocumentStatus(value: unknown): DocumentStatus {
  return ["ai_draft", "needs_review", "verified", "published", "archived"].includes(String(value))
    ? (String(value) as DocumentStatus)
    : "needs_review";
}

function toConfidence(value: unknown): Confidence {
  return value === "medium" || value === "high" ? value : "low";
}

async function getSupabaseDocumentIndex(staticSlugs: Set<string>): Promise<LlmsDocumentIndexItem[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];

  try {
    const sb = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const query = sb
      .from("documents")
      .select("status,confidence,slug,lang,title")
      .in("status", ["verified", "needs_review", "published"])
      .order("updated_at", { ascending: false })
      .limit(500);

    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Supabase document index query timed out")), DOCUMENT_INDEX_TIMEOUT_MS);
    });

    const { data, error } = await Promise.race([query, timeout]);
    if (error) return [];

    return ((data ?? []) as SupabaseDocumentIndexRow[])
      .filter((row) => Boolean(row.slug) && !staticSlugs.has(String(row.slug)))
      .map((row) => ({
        slug: String(row.slug),
        lang: row.lang || "ko",
        title: row.title || String(row.slug),
        status: toDocumentStatus(row.status),
        confidence: toConfidence(row.confidence),
        source: "supabase" as const,
      }));
  } catch {
    return [];
  }
}

function appendDocumentLine(lines: string[], doc: LlmsDocumentIndexItem) {
  lines.push(
    `- [${doc.title}](${documentPageUrl(doc.slug, doc.lang)}) — status: ${doc.status}, confidence: ${doc.confidence}, source: ${doc.source} ` +
      `· canonical: ${documentPageUrl(doc.slug, doc.lang)} · JSON: ${apiDocumentUrl(doc.slug)} · Markdown: ${rawMarkdownUrl(doc.slug)}`,
  );
}

export async function GET() {
  const staticDocuments: LlmsDocumentIndexItem[] = getAllRegistryBundles().map((b) => ({
    slug: b.document.slug,
    lang: b.document.lang,
    title: b.document.title,
    status: b.document.status,
    confidence: b.document.confidence,
    source: "static" as const,
  }));
  const staticSlugs = new Set(staticDocuments.map((doc) => doc.slug));
  const supabaseDocuments = await getSupabaseDocumentIndex(staticSlugs);
  const documents = [...staticDocuments, ...supabaseDocuments];
  const verifiedDocuments = documents.filter((doc) => doc.status === "verified");
  const needsReviewDocuments = documents.filter((doc) => doc.status !== "verified");

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
  lines.push("- Cite only verified claims that have at least one source.");
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
  lines.push(`- Per-document canonical page: \`${documentPageUrl("<slug>", "<lang>")}\``);
  lines.push(`- Per-document JSON: \`${apiDocumentUrl("<slug>")}\``);
  lines.push(`- Per-document Markdown: \`${rawMarkdownUrl("<slug>")}\``);
  lines.push("");
  lines.push("## Verified documents");
  lines.push("");
  if (verifiedDocuments.length === 0) lines.push("- None currently listed.");
  for (const doc of verifiedDocuments) appendDocumentLine(lines, doc);
  lines.push("");
  lines.push("## Needs review documents");
  lines.push("");
  if (needsReviewDocuments.length === 0) lines.push("- None currently listed.");
  for (const doc of needsReviewDocuments) appendDocumentLine(lines, doc);
  lines.push("");

  return new Response(lines.join("\n"), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
