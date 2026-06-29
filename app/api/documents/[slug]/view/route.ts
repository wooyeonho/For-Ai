import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/admin-api";
import { recordDocumentAnalyticsEvent } from "@/lib/analytics";
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

  const recorded = await recordDocumentAnalyticsEvent(sb, request, slug, "read");
  if (!recorded) return NextResponse.json({ error: "document not found" }, { status: 404 });

  return NextResponse.json({ success: true });
}
