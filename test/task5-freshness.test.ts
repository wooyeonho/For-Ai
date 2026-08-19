import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyFreshnessFetchError,
  inspectEvidenceFreshness,
} from "../lib/task5-freshness";
import { SafeFetchError } from "../lib/safe-fetch-external-source";

const evidence = {
  claim_evidence_id: "00000000-0000-0000-0000-000000000001",
  claim_id: "claim-1",
  claim_version_id: "00000000-0000-0000-0000-000000000002",
  canonical_url: "https://example.com/source",
  previous_final_url: "https://example.com/source",
  previous_normalized_text_hash: "old-hash",
  quote_text: "The verified statement remains available.",
  valid_until: null,
};

const resolveHost = async () => [{ address: "93.184.216.34", family: 4 as const }];
type MockResponse = { status: number; headers: Record<string, string>; body: Buffer };
function request(status: number, html: string, finalLocation?: string): () => Promise<MockResponse> {
  let calls = 0;
  return async (): Promise<MockResponse> => {
    calls += 1;
    if (calls === 1 && finalLocation) {
      const headers: Record<string, string> = { location: finalLocation };
      return { status: 302, headers, body: Buffer.alloc(0) };
    }
    const headers: Record<string, string> = { "content-type": "text/html" };
    return { status, headers, body: Buffer.from(html) };
  };
}

test("403 and 429 are never classified as not_found", () => {
  assert.equal(classifyFreshnessFetchError(new SafeFetchError("http_status", "blocked", { status: 403 })).result, "blocked");
  assert.equal(classifyFreshnessFetchError(new SafeFetchError("http_status", "limited", { status: 429 })).result, "temporarily_unavailable");
});

test("404 and 410 are classified as not_found", () => {
  assert.equal(classifyFreshnessFetchError(new SafeFetchError("http_status", "missing", { status: 404 })).result, "not_found");
  assert.equal(classifyFreshnessFetchError(new SafeFetchError("http_status", "gone", { status: 410 })).result, "not_found");
});

test("quote disappearance takes precedence over content hash change", async () => {
  const outcome = await inspectEvidenceFreshness(evidence, {
    dependencies: {
      resolveHost,
      request: request(200, "<!doctype html><html><body>Replacement material only.</body></html>"),
      now: () => new Date("2026-07-17T00:00:00Z"),
    },
  });
  assert.equal(outcome.result, "evidence_missing");
});

test("changed page with retained quote is content_changed", async () => {
  const outcome = await inspectEvidenceFreshness(evidence, {
    dependencies: {
      resolveHost,
      request: request(200, "<!doctype html><html><body>The verified statement remains available. Additional context changed.</body></html>"),
      now: () => new Date("2026-07-17T00:00:00Z"),
    },
  });
  assert.equal(outcome.result, "content_changed");
});

test("redirect is reported when content remains unchanged", async () => {
  const crypto = await import("node:crypto");
  const html = "<!doctype html><html><body>The verified statement remains available.</body></html>";
  const canonicalText = "The verified statement remains available.";
  const unchanged = { ...evidence, previous_normalized_text_hash: crypto.createHash("sha256").update(canonicalText).digest("hex") };
  const outcome = await inspectEvidenceFreshness(unchanged, {
    dependencies: {
      resolveHost,
      request: request(200, html, "https://example.com/new-source"),
      now: () => new Date("2026-07-17T00:00:00Z"),
    },
  });
  assert.equal(outcome.result, "redirected");
  assert.equal(outcome.finalUrl, "https://example.com/new-source");
});

test("missing inline snapshot text fails closed", async () => {
  const outcome = await inspectEvidenceFreshness({ ...evidence, quote_text: null });
  assert.equal(outcome.result, "fetch_error");
  assert.equal(outcome.errorCode, "snapshot_text_unavailable");
});
