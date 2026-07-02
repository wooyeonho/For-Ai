import { createClient } from "@supabase/supabase-js";
import { getAllRegistryBundles, isVerifiedDocumentBundle } from "./data";

export type HomeDocItem = {
  slug: string;
  title: string;
  category?: string;
  summary?: string;
  source: "static" | "supabase";
  verification: "verified" | "candidate";
};

export type HomePopularDoc = {
  document_id: string;
  view_count: number;
  ai_citation_count: number;
  slug?: string;
  title?: string;
};

type SupabaseRegistryDocument = {
  slug: string;
  title: string;
  category?: string;
  status?: string;
  confidence?: string;
  registry_claims?: { status?: string; confidence?: string; claim_value?: string }[];
};

type SupabaseDocumentStat = {
  document_id: string;
  view_count: number;
  ai_citation_count: number;
};

type SupabaseDocumentSummary = {
  id: string;
  slug: string;
  title: string;
};

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? createClient(url, key) : null;
}

export async function getHomeDocs(): Promise<HomeDocItem[]> {
  const staticDocs: HomeDocItem[] = getAllRegistryBundles().map((bundle) => ({
    slug: bundle.document.slug,
    title: bundle.document.title,
    category: undefined,
    summary: bundle.listing?.summary ?? undefined,
    source: "static" as const,
    verification: isVerifiedDocumentBundle(bundle) ? "verified" as const : "candidate" as const,
  }));
  const staticSlugs = new Set(staticDocs.map((document) => document.slug));
  const sb = getSupabaseClient();

  if (!sb) return staticDocs;

  try {
    const { data } = await sb
      .from("registry_documents")
      .select("slug,title,category,status,confidence,registry_claims(status,confidence,claim_value)")
      .in("status", ["published", "verified", "needs_review"])
      .order("created_at", { ascending: false })
      .limit(500);

    const supabaseDocs = ((data ?? []) as SupabaseRegistryDocument[])
      .filter((document) => !staticSlugs.has(document.slug))
      .map((document) => {
        const claims = document.registry_claims ?? [];
        const verification =
          (document.status === "published" || document.status === "verified") &&
          document.confidence !== "low" &&
          claims.length > 0 &&
          claims.every((claim) =>
            claim.status === "verified" &&
            claim.confidence !== "low" &&
            claim.claim_value !== "확인 필요",
          )
            ? "verified"
            : "candidate";
        const firstVerifiedValue = claims.find(
          (claim) => claim.claim_value && claim.claim_value !== "확인 필요",
        )?.claim_value;

        return {
          slug: document.slug,
          title: document.title,
          category: document.category ?? "",
          summary: firstVerifiedValue ?? undefined,
          source: "supabase" as const,
          verification,
        };
      });

    return [...supabaseDocs, ...staticDocs];
  } catch {
    return staticDocs;
  }
}

export async function getHomePopularDocs(): Promise<HomePopularDoc[]> {
  const sb = getSupabaseClient();
  if (!sb) return [];

  try {
    const { data: stats } = await sb
      .from("document_stats")
      .select("document_id, view_count, ai_citation_count")
      .order("ai_citation_count", { ascending: false })
      .limit(10);

    if (!stats || stats.length === 0) return [];

    const typedStats = stats as SupabaseDocumentStat[];
    const docIds = typedStats.map((stat) => stat.document_id);
    const { data: docs } = await sb
      .from("documents")
      .select("id, slug, title")
      .in("id", docIds);

    const docMap = new Map(((docs ?? []) as SupabaseDocumentSummary[]).map((document) => [document.id, document]));
    return typedStats
      .map((stat) => {
        const document = docMap.get(stat.document_id);
        return {
          document_id: stat.document_id,
          view_count: stat.view_count,
          ai_citation_count: stat.ai_citation_count,
          slug: document?.slug,
          title: document?.title,
        };
      })
      .filter((document): document is HomePopularDoc & { slug: string } => Boolean(document.slug));
  } catch {
    return [];
  }
}
