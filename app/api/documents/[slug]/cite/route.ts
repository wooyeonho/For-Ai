import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/admin-api";
import { recordDocumentAnalyticsEvent } from "@/lib/analytics";
import { clientIp, rateLimited } from "@/lib/rate-limit";

// Cap repeat citations from the same caller for the same document so the public,
// unauthenticated counter cannot be trivially inflated.
const CITE_MAX_PER_WINDOW = 5;
const CITE_WINDOW_MS = 60_000;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  if (rateLimited("doc-cite", `${clientIp(request)}:${slug}`, CITE_MAX_PER_WINDOW, CITE_WINDOW_MS)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  // Stat writes use the service-role client so the public anon key has no write
  // access to document_stats (RLS locked). Reads stay public via anon select.
  const sb = supabaseAdmin();
  if (!sb) {
    return NextResponse.json({ error: "DB not configured", missing: ["SUPABASE_SERVICE_ROLE_KEY"] }, { status: 500 });
  }

  const recorded = await recordDocumentAnalyticsEvent(sb, request, slug, "api_cite");
  if (!recorded) return NextResponse.json({ error: "document not found" }, { status: 404 });

  return NextResponse.json({ success: true });
}
