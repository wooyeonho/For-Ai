import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/admin-api";
import { clientIp, rateLimited } from "@/lib/rate-limit";

// Cap repeat views from the same caller for the same document within a window.
const VIEW_MAX_PER_WINDOW = 10;
const VIEW_WINDOW_MS = 60_000;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  if (rateLimited("doc-view", `${clientIp(request)}:${slug}`, VIEW_MAX_PER_WINDOW, VIEW_WINDOW_MS)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

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
