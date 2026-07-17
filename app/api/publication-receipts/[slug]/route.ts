import { NextResponse } from "next/server";
import { checkRateLimit, rateLimitHeaders, rateLimitResponse } from "@/lib/api-rate-limit";
import {
  getPublicAssistedPublicationReceipts,
  loadRegistryBundleWithPublicationState,
} from "@/lib/registry-publication";

export const revalidate = 60;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const rateLimit = await checkRateLimit(request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);
  const { slug } = await params;
  const bundle = await loadRegistryBundleWithPublicationState(slug);
  if (!bundle) {
    return NextResponse.json({ error: "Document not found" }, { status: 404, headers: rateLimitHeaders(rateLimit) });
  }
  const receipts = await getPublicAssistedPublicationReceipts(slug, bundle.claims.map((claim) => claim.id));
  return NextResponse.json({
    document_slug: bundle.document.slug,
    receipts,
    transparency: {
      ai_origin_label_is_permanent: true,
      human_assisted_publication_required: true,
      operator_identity_public: false,
      full_source_snapshots_public: false,
      private_review_notes_public: false,
    },
  }, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      ...rateLimitHeaders(rateLimit),
    },
  });
}
