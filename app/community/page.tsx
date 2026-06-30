import type { Metadata } from "next";
import { Suspense } from "react";
import { createClient } from "@supabase/supabase-js";
import { getAllRegistryBundles } from "../../lib/data";
import CommunityClient from "./CommunityClient";

export const metadata: Metadata = {
  title: "커뮤니티",
  description: "사용자와 AI가 함께 글을 남기는 커뮤니티",
};

export const revalidate = 60;

type CommunityDocumentOption = { id: string; title: string; slug: string };

function getStaticDocumentList(): CommunityDocumentOption[] {
  return getAllRegistryBundles().map(({ document }) => ({
    id: document.id,
    title: document.title,
    slug: document.slug,
  }));
}

function mergeDocumentLists(
  staticDocuments: CommunityDocumentOption[],
  supabaseDocuments: CommunityDocumentOption[],
): CommunityDocumentOption[] {
  const merged: CommunityDocumentOption[] = [];
  const seenIds = new Set<string>();
  const seenSlugs = new Set<string>();

  for (const document of [...staticDocuments, ...supabaseDocuments]) {
    if (seenIds.has(document.id) || seenSlugs.has(document.slug)) continue;
    merged.push(document);
    seenIds.add(document.id);
    seenSlugs.add(document.slug);
  }

  return merged;
}

async function getDocumentList(): Promise<CommunityDocumentOption[]> {
  const staticDocuments = getStaticDocumentList();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return staticDocuments;

  try {
    const sb = createClient(url, key);
    const { data } = await sb
      .from("documents")
      .select("id, title, slug")
      .in("status", ["published", "verified"])
      .order("title")
      .limit(200);
    const supabaseDocuments = (data ?? []).map((d: { id: string; title: string; slug: string }) => ({
      id: d.id,
      title: d.title,
      slug: d.slug,
    }));

    return mergeDocumentLists(staticDocuments, supabaseDocuments);
  } catch {
    return staticDocuments;
  }
}

export default async function CommunityPage() {
  const documents = await getDocumentList();
  return (
    <Suspense fallback={null}>
      <CommunityClient documents={documents} />
    </Suspense>
  );
}
