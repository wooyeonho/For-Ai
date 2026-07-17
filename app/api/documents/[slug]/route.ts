import { NextResponse } from "next/server";
import { loadRegistryBundleWithPublicationState } from "../../../../lib/registry-publication";
import { renderDocumentJson } from "../../../../lib/render";
import { checkRateLimit, rateLimitHeaders, rateLimitResponse } from "../../../../lib/api-rate-limit";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const rateLimit = await checkRateLimit(request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const { slug } = await params;
  const bundle = await loadRegistryBundleWithPublicationState(slug);

  if (!bundle) {
    return NextResponse.json({ error: "Document not found" }, { status: 404, headers: rateLimitHeaders(rateLimit) });
  }

  const rendered = renderDocumentJson(bundle);
  return NextResponse.json(rendered, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      "X-For-Ai-Can-Cite": rendered.citation_guidance.can_cite ? "true" : "false",
      ...rateLimitHeaders(rateLimit),
    },
  });
}
