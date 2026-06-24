import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: "DB not configured" }, { status: 500 });
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const { data: doc } = await sb
    .from("documents")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (!doc) return NextResponse.json({ error: "document not found" }, { status: 404 });

  const { data: existing } = await sb
    .from("document_stats")
    .select("view_count")
    .eq("document_id", doc.id)
    .maybeSingle();

  if (existing) {
    await sb
      .from("document_stats")
      .update({ view_count: existing.view_count + 1, updated_at: new Date().toISOString() })
      .eq("document_id", doc.id);
  } else {
    await sb
      .from("document_stats")
      .insert({ document_id: doc.id, view_count: 1, ai_citation_count: 0 });
  }

  return NextResponse.json({ success: true });
}
