import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/admin-api";
import { recordDocumentAnalyticsEvent } from "@/lib/analytics";
import { clientHash, rateLimited } from "@/lib/rate-limit";

const COPY_MAX_PER_WINDOW = 10;
const COPY_WINDOW_MS = 60_000;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  if (rateLimited("doc-copy-citation", `${clientHash(request)}:${slug}`, COPY_MAX_PER_WINDOW, COPY_WINDOW_MS)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "DB not configured", missing: ["SUPABASE_SERVICE_ROLE_KEY"] }, { status: 500 });

  const recorded = await recordDocumentAnalyticsEvent(sb, request, slug, "citation_copy");
  if (!recorded) return NextResponse.json({ error: "document not found" }, { status: 404 });

  return NextResponse.json({ success: true });
}
