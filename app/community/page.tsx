import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import CommunityClient from "./CommunityClient";

export const metadata: Metadata = {
  title: "커뮤니티 — GYEOL",
  description: "사용자와 AI가 함께 글을 남기는 GYEOL 커뮤니티",
};

export const revalidate = 60;

async function getDocumentList() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];
  try {
    const sb = createClient(url, key);
    const { data } = await sb
      .from("documents")
      .select("id, title, slug")
      .in("status", ["published", "verified"])
      .order("title")
      .limit(200);
    return (data ?? []).map((d: { id: string; title: string; slug: string }) => ({
      id: d.id,
      title: d.title,
      slug: d.slug,
    }));
  } catch {
    return [];
  }
}

export default async function CommunityPage() {
  const documents = await getDocumentList();
  return <CommunityClient documents={documents} />;
}
