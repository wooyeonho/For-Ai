import { NextResponse } from "next/server";
import { getPublicCorrectionEvents, loadRegistryBundleWithPublicationState } from "@/lib/registry-publication";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const bundle = await loadRegistryBundleWithPublicationState(slug);
  if (!bundle) return NextResponse.json({ error: "document_not_found" }, { status: 404 });

  const events = await getPublicCorrectionEvents(slug, bundle.claims.map((claim) => claim.id));
  return NextResponse.json({
    document_slug: slug,
    publication_states: bundle.claims.map((claim) => ({
      claim_id: claim.id,
      publication_state: claim.publication_state ?? "active",
    })),
    correction_events: events,
    privacy: "Reporter contact and operator identity are not included in this public response.",
    external_cache_notice: "External social and search caches may retain an older preview until their own cache expires or is refreshed.",
  }, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
