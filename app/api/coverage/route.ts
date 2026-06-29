import { NextResponse } from "next/server";
import { getCoverageMetrics } from "@/lib/goal-metrics";
import { checkRateLimit, rateLimitHeaders, rateLimitResponse } from "@/lib/api-rate-limit";

// Public coverage dashboard metrics for AI/index consumers and humans.
// Values are derived from the same static registry bundles used by /goal.
export async function GET(request: Request) {
  const rateLimit = await checkRateLimit(request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const metrics = getCoverageMetrics();

  return NextResponse.json(
    {
      ...metrics,
      citation_policy:
        'Cite only citation-ready claims. Never cite values shown as "확인 필요", low confidence, needs_review, or stale without re-checking the source.',
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        ...rateLimitHeaders(rateLimit),
      },
    },
  );
}
