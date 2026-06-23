import { createClient } from "@supabase/supabase-js";
import { getAllRegistryBundles } from "../../lib/data";
import { siteUrl, documentPageUrl, apiDocumentUrl, rawMarkdownUrl } from "../../lib/urls";
import type { Confidence, DocumentStatus, RegistryDocumentBundle } from "../../lib/types";

// Static-first AI/RAG entry point. Served as text/plain at /llms.txt.
// Revalidate periodically so the lightweight Supabase document index can be included
// without making llms.txt depend on Supabase availability.
export const revalidate = 60;

type DocumentIndexItem = {
  slug: string;
  lang: string;
  title: string;
  status: DocumentStatus;
  confidence: Confidence;
  source: "static" | "supabase";
};

type SupabaseDocumentRow = {
  slug: string | null;
  lang: string | null;
  title: string | null;
  status: string | null;
  confidence: string | null;
};

function toConfidence(value: unknown): Confidence {
  return value === "medium" || value === "high" ? value : "low";
}

function toDocumentStatus(value: unknown): DocumentStatus {
  return ["ai_draft", "needs_review", "verified", "published", "archived"].includes(String(value))
    ? (value as DocumentStatus)
    : "needs_review";
}

function indexItemFromBundle(bundle: RegistryDocumentBundle): DocumentIndexItem {
  const { document } = bundle;
  return {
    slug: document.slug,
    lang: document.lang,
    title: document.title,
    status: document.status,
    confidence: document.confidence,
    source: "static",
  };
}

function indexKey(item: Pick<DocumentIndexItem, "lang" | "slug">): string {
  return `${item.lang}:${item.slug}`;
}

async function getSupabaseDocumentIndex(): Promise<DocumentIndexItem[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];

  try {
    const supabase = createClient(url, key);
    const { data, error } = await supabase
      .from("documents")
      .select("status,confidence,slug,lang,title")
      .in("status", ["verified", "published", "needs_review"])
      .order("lang", { ascending: true })
      .order("slug", { ascending: true })
      .limit(500);

    if (error) return [];

    return ((data ?? []) as SupabaseDocumentRow[])
      .filter((row) => row.slug && row.lang && row.title)
      .map((row) => ({
        slug: String(row.slug),
        lang: String(row.lang),
        title: String(row.title),
        status: toDocumentStatus(row.status),
        confidence: toConfidence(row.confidence),
        source: "supabase" as const,
      }));
  } catch {
    return [];
  }
}

function documentLine(item: DocumentIndexItem): string {
  return (
    `- [${item.title}](${documentPageUrl(item.slug, item.lang)}) — ` +
    `status: ${item.status}, confidence: ${item.confidence}, source: ${item.source} ` +
    `· JSON: ${apiDocumentUrl(item.slug)} · Markdown: ${rawMarkdownUrl(item.slug)}`
  );
}

export async function GET() {
  const staticIndex = getAllRegistryBundles().map(indexItemFromBundle);
  const seen = new Set(staticIndex.map(indexKey));
  const supabaseIndex = (await getSupabaseDocumentIndex()).filter((item) => {
    const key = indexKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const documents = [...staticIndex, ...supabaseIndex].sort((a, b) =>
    a.lang === b.lang ? a.title.localeCompare(b.title, a.lang) : a.lang.localeCompare(b.lang),
  );
  const verifiedDocuments = documents.filter(
    (item) => item.status === "verified" || item.status === "published",
  );
  const needsReviewDocuments = documents.filter((item) => item.status === "needs_review");

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
  lines.push(`- Per-document canonical page: \`${documentPageUrl("<slug>", "<lang>")}\``);
  lines.push(`- Per-document JSON: \`${apiDocumentUrl("<slug>")}\``);
  lines.push(`- Per-document Markdown: \`${rawMarkdownUrl("<slug>")}\``);
  lines.push("");
  lines.push("## Verified documents");
  lines.push("");
  if (verifiedDocuments.length === 0) lines.push("- None yet.");
  for (const item of verifiedDocuments) lines.push(documentLine(item));
  lines.push("");
  lines.push("## Needs review documents");
  lines.push("");
  if (needsReviewDocuments.length === 0) lines.push("- None yet.");
  for (const item of needsReviewDocuments) lines.push(documentLine(item));
  lines.push("");

  return new Response(lines.join("\n"), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
