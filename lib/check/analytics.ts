import type { CheckResponse, NoMatchReason } from "./types";

// Bible v7 §6.8: allowed fields only — sentence count, processing duration,
// match/not-found counts, gate counts, error code. Never the input text,
// sentence text, claim query text, raw IP, or request body.
export type CheckAnalyticsEvent = {
  event: "check_answer";
  locale: string;
  sentenceCount: number;
  processingDurationMsBucket: string;
  matchCounts: { verified: number; needs_review: number; disputed: number; not_found: number };
  gateCounts: Record<NoMatchReason, number>;
  errorCode: string | null;
};

const DURATION_BUCKETS_MS = [100, 250, 500, 1_000, 2_500, 5_000, 10_000];

function bucketDuration(durationMs: number): string {
  const bucket = DURATION_BUCKETS_MS.find((ceiling) => durationMs <= ceiling);
  return bucket ? `<=${bucket}` : `>${DURATION_BUCKETS_MS[DURATION_BUCKETS_MS.length - 1]}`;
}

const EMPTY_GATE_COUNTS: Record<NoMatchReason, number> = {
  no_candidates: 0,
  below_threshold: 0,
  negation_mismatch: 0,
  quantity_mismatch: 0,
  polarity_mismatch: 0,
};

export function buildCheckAnalyticsEvent(
  response: CheckResponse,
  durationMs: number,
  locale: string,
  errorCode: string | null = null,
): CheckAnalyticsEvent {
  const gateCounts = { ...EMPTY_GATE_COUNTS };
  for (const result of response.sentences) {
    if (result.no_match_reason) gateCounts[result.no_match_reason] += 1;
  }

  return {
    event: "check_answer",
    locale,
    sentenceCount: response.summary.total,
    processingDurationMsBucket: bucketDuration(durationMs),
    matchCounts: {
      verified: response.summary.verified,
      needs_review: response.summary.needs_review,
      disputed: response.summary.disputed,
      not_found: response.summary.not_found,
    },
    gateCounts,
    errorCode,
  };
}

// Logging is isolated in its own function so tests can spy on/replace it
// without touching the pure event-shape builder above, and so a logging
// failure never blocks the API response (see app/api/check/route.ts).
export function logCheckAnalyticsEvent(event: CheckAnalyticsEvent): void {
  console.log("[check-answer-analytics]", JSON.stringify(event));
}
