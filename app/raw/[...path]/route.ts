import { NextResponse } from "next/server";
import { renderDocumentMarkdown } from "../../../lib/render";
import { getPublicAssistedPublicationReceipts, loadRegistryBundleWithPublicationState } from "../../../lib/registry-publication";
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

  const receipts = await getPublicAssistedPublicationReceipts(slug, bundle.claims.map((claim) => claim.id));
  const receiptMarkdown = receipts.length === 0
    ? ""
    : `\n\n## AI-origin transparency receipts\n\n${receipts.map((receipt) => [
      `- claim_id: ${receipt.claim_id}`,
      `  - content_origin: ${receipt.content_origin}`,
      `  - publication_mode: ${receipt.publication_mode}`,
      `  - human_assisted: true`,
      `  - verification_policy_version: ${receipt.verification_policy_version}`,
      `  - published_at: ${receipt.published_at}`,
      `  - receipt: /api/publication-receipts/${slug}`,
    ].join("\n")).join("\n")}`;
  return new NextResponse(`${renderDocumentMarkdown(bundle)}${receiptMarkdown}`, {
    headers: { "content-type": "text/markdown; charset=utf-8", ...rateLimitHeaders(rateLimit) },
  });
}
