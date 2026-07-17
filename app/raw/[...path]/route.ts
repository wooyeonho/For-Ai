import { NextResponse } from "next/server";
import { renderDocumentMarkdown } from "../../../lib/render";
import { loadRegistryBundleWithPublicationState } from "../../../lib/registry-publication";
import { checkRateLimit, rateLimitHeaders, rateLimitResponse } from "../../../lib/api-rate-limit";

export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const rateLimit = await checkRateLimit(request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const { path } = await params;
  const fileName = path.join("/");

  if (!fileName.endsWith(".md")) {
    return new NextResponse("Not found", { status: 404, headers: rateLimitHeaders(rateLimit) });
  }

  const slug = fileName.slice(0, -3);
  const bundle = await loadRegistryBundleWithPublicationState(slug);

  if (!bundle) {
    return new NextResponse("Not found", { status: 404, headers: rateLimitHeaders(rateLimit) });
  }

  return new NextResponse(renderDocumentMarkdown(bundle), {
    headers: { "content-type": "text/markdown; charset=utf-8", ...rateLimitHeaders(rateLimit) },
  });
}
