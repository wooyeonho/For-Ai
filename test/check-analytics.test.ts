import assert from "node:assert/strict";
import test from "node:test";
import { buildCheckAnalyticsEvent, logCheckAnalyticsEvent } from "../lib/check/analytics";
import type { CheckResponse } from "../lib/check/types";

const SAMPLE_RESPONSE: CheckResponse = {
  sentences: [
    { sentence: "The Seoul Metro base fare is 1400 won.", match: { claim_id: "c1", document_slug: "seoul-metro-fare", claim_text: "Seoul Metro base fare", status: "verified", confidence: "high", similarity: 0.8 }, no_match_reason: null },
    { sentence: "The fare decreased last year.", match: null, no_match_reason: "polarity_mismatch" },
    { sentence: "Unrelated sentence about the weather today.", match: null, no_match_reason: "no_candidates" },
  ],
  summary: { total: 3, verified: 1, needs_review: 0, disputed: 0, not_found: 2 },
};

test("buildCheckAnalyticsEvent never includes sentence text, claim text, or any free-form user input", () => {
  const event = buildCheckAnalyticsEvent(SAMPLE_RESPONSE, 420, "en");
  const serialized = JSON.stringify(event);

  assert.ok(!serialized.includes("Seoul Metro base fare"), "sentence text leaked into analytics payload");
  assert.ok(!serialized.includes("fare decreased"), "sentence text leaked into analytics payload");
  assert.ok(!serialized.includes("weather"), "sentence text leaked into analytics payload");

  // Only the allow-listed fields from Bible v7 §6.8 should be present.
  const allowedTopLevelKeys = new Set(["event", "locale", "sentenceCount", "processingDurationMsBucket", "matchCounts", "gateCounts", "errorCode"]);
  for (const key of Object.keys(event)) {
    assert.ok(allowedTopLevelKeys.has(key), `unexpected analytics field: ${key}`);
  }
});

test("buildCheckAnalyticsEvent reports correct sentence/match/gate counts", () => {
  const event = buildCheckAnalyticsEvent(SAMPLE_RESPONSE, 420, "ko");
  assert.equal(event.sentenceCount, 3);
  assert.equal(event.matchCounts.verified, 1);
  assert.equal(event.matchCounts.not_found, 2);
  assert.equal(event.gateCounts.polarity_mismatch, 1);
  assert.equal(event.gateCounts.no_candidates, 1);
  assert.equal(event.gateCounts.negation_mismatch, 0);
  assert.equal(event.locale, "ko");
  assert.equal(event.errorCode, null);
});

test("buildCheckAnalyticsEvent buckets processing duration rather than reporting raw milliseconds", () => {
  const fast = buildCheckAnalyticsEvent(SAMPLE_RESPONSE, 50, "en");
  const slow = buildCheckAnalyticsEvent(SAMPLE_RESPONSE, 9_999, "en");
  assert.equal(fast.processingDurationMsBucket, "<=100");
  assert.equal(slow.processingDurationMsBucket, "<=10000");
});

test("buildCheckAnalyticsEvent accepts an explicit errorCode for failure-path logging", () => {
  const emptyResponse: CheckResponse = { sentences: [], summary: { total: 0, verified: 0, needs_review: 0, disputed: 0, not_found: 0 } };
  const event = buildCheckAnalyticsEvent(emptyResponse, 5, "en", "check_timeout");
  assert.equal(event.errorCode, "check_timeout");
});

test("logCheckAnalyticsEvent writes a single structured log line without throwing", () => {
  const originalLog = console.log;
  const calls: unknown[][] = [];
  console.log = (...args: unknown[]) => {
    calls.push(args);
  };
  try {
    logCheckAnalyticsEvent(buildCheckAnalyticsEvent(SAMPLE_RESPONSE, 100, "en"));
  } finally {
    console.log = originalLog;
  }
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "[check-answer-analytics]");
  const loggedPayload = String(calls[0][1]);
  assert.ok(!loggedPayload.includes("Seoul Metro base fare"), "sentence text leaked into log line");
});
