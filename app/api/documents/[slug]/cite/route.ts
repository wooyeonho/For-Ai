import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/admin-api";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  // Stat writes use the service-role client so the public anon key has no write
  // access to document_stats (RLS locked). Reads stay public via anon select.
  const sb = supabaseAdmin();
  if (!sb) {
    return NextResponse.json({ error: "DB not configured", missing: ["SUPABASE_SERVICE_ROLE_KEY"] }, { status: 500 });
  }

  const { data: doc } = await sb
    .from("documents")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (!doc) return NextResponse.json({ error: "document not found" }, { status: 404 });

  const { data: existing } = await sb
    .from("document_stats")
    .select("ai_citation_count")
    .eq("document_id", doc.id)
    .maybeSingle();

  if (existing) {
    await sb
      .from("document_stats")
      .update({ ai_citation_count: existing.ai_citation_count + 1, updated_at: new Date().toISOString() })
      .eq("document_id", doc.id);
  } else {
    await sb
      .from("document_stats")
      .insert({ document_id: doc.id, view_count: 0, ai_citation_count: 1 });
  }

  return NextResponse.json({ success: true });
}
