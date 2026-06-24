import { createClient } from "@supabase/supabase-js";

async function getStats(documentId: string): Promise<{ view_count: number; ai_citation_count: number } | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    const sb = createClient(url, key);
    const { data } = await sb
      .from("document_stats")
      .select("view_count, ai_citation_count")
      .eq("document_id", documentId)
      .maybeSingle();
    return data ?? null;
  } catch {
    return null;
  }
}

export async function DocumentStatsBar({ documentId }: { documentId: string }) {
  const stats = await getStats(documentId);
  if (!stats) return null;

  return (
    <div style={{ display: "flex", gap: 16, padding: "8px 0", fontSize: 13, color: "#6b7280" }}>
      <span title="조회수">👁 조회 {stats.view_count.toLocaleString()}</span>
      <span title="AI 인용 횟수">✦ AI 인용 {stats.ai_citation_count.toLocaleString()}</span>
    </div>
  );
}
