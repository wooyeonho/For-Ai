import { createClient } from "@supabase/supabase-js";
import { DEFAULT_LOCALE } from "./i18n/locales";

export type SupabaseDocumentIndexItem = {
  slug: string;
  lang: string;
  updated_at: string | null;
  last_verified_at: string | null;
};

type DocumentIndexRow = {
  slug: string | null;
  lang: string | null;
  updated_at: string | null;
  last_verified_at: string | null;
};

export async function getPublishedVerifiedDocumentIndexFromSupabase(): Promise<SupabaseDocumentIndexItem[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];

  const sb = createClient(url, key);
  const { data, error } = await sb
    .from("documents")
    .select("slug, lang, updated_at, last_verified_at")
    .in("status", ["published", "verified"])
    .order("updated_at", { ascending: false });

  if (error) throw error;

  return ((data ?? []) as DocumentIndexRow[])
    .filter((row) => typeof row.slug === "string" && row.slug.length > 0)
    .map((row) => ({
      slug: row.slug as string,
      lang: row.lang ?? DEFAULT_LOCALE,
      updated_at: row.updated_at,
      last_verified_at: row.last_verified_at,
    }));
}
