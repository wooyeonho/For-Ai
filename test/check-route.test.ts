import assert from "node:assert/strict";
import test from "node:test";
import { resetCandidateIndexForTests } from "../lib/check/candidates";
import type { CheckCandidate } from "../lib/check/types";

function checkRequest(body: BodyInit, ip = "203.0.113.10", headers: Record<string, string> = {}): Request {
  return new Request("https://for-ai.example/api/check", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip, ...headers },
    body,
  });
}

function candidate(overrides: Partial<CheckCandidate> & Pick<CheckCandidate, "claim_id" | "claim_text">): CheckCandidate {
  return { document_slug: "test-doc", claim_value: "", field_path: "value", status: "verified", confidence: "high", ...overrides };
}

test.beforeEach(() => {
  resetCandidateIndexForTests([candidate({ claim_id: "metro-fare", claim_text: "The Seoul Metro base fare is 1400 won for adults." })]);
});

test.afterEach(() => {
  resetCandidateIndexForTests(null);
});

test("invalid JSON body returns 400 invalid_json", async () => {
  const { POST } = await import("../app/api/check/route");
  const response = await POST(checkRequest("{not valid json", "203.0.113.11"));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "invalid_json" });
});

test("missing text field returns 400 invalid_request", async () => {
  const { POST } = await import("../app/api/check/route");
  const response = await POST(checkRequest(JSON.stringify({ locale: "en" }), "203.0.113.12"));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "invalid_request" });
});

test("text longer than 5000 chars returns 400 text_too_long", async () => {
  const { POST } = await import("../app/api/check/route");
  const response = await POST(checkRequest(JSON.stringify({ text: "a".repeat(5_001) }), "203.0.113.13"));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "text_too_long" });
});

test("unsupported locale returns 400 unsupported_locale", async () => {
  const { POST } = await import("../app/api/check/route");
  const response = await POST(checkRequest(JSON.stringify({ text: "The Seoul Metro base fare is 1400 won.", locale: "fr" }), "203.0.113.14"));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "unsupported_locale" });
});

test("text with no analyzable sentences returns 422 no_analyzable_sentences", async () => {
  const { POST } = await import("../app/api/check/route");
  const response = await POST(checkRequest(JSON.stringify({ text: "hi", locale: "en" }), "203.0.113.15"));
  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), { error: "no_analyzable_sentences" });
});

test("more than 50 analyzable sentences returns 422 too_many_sentences", async () => {
  const { POST } = await import("../app/api/check/route");
  const manySentences = Array.from({ length: 51 }, (_, i) => `This is a sufficiently long sentence number ${i} here.`).join(" ");
  const response = await POST(checkRequest(JSON.stringify({ text: manySentences.slice(0, 4_999), locale: "en" }), "203.0.113.16"));
  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), { error: "too_many_sentences" });
});

// A declared Content-Length between the real 32KB limit and the 64KB
// fast-reject threshold would pass the header-based fast check, so this
// only succeeds if the real streaming byte counter (not Content-Length) is
// what actually rejects it.
test("actual body exceeding the real byte limit is rejected even when Content-Length would pass the fast check", async () => {
  const { POST } = await import("../app/api/check/route");
  const oversizedJson = JSON.stringify({ text: "a", padding: "x".repeat(40_000), locale: "en" });
  assert.ok(Buffer.byteLength(oversizedJson) > 32_000 && Buffer.byteLength(oversizedJson) < 64_000);
  const response = await POST(checkRequest(oversizedJson, "203.0.113.17"));
  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), { error: "payload_too_large" });
});

test("Content-Length far beyond the fast-reject threshold is rejected without reading the body", async () => {
  const { POST } = await import("../app/api/check/route");
  const response = await POST(checkRequest(JSON.stringify({ text: "The Seoul Metro base fare is 1400 won." }), "203.0.113.18", { "content-length": "999999" }));
  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), { error: "payload_too_large" });
});

test("invalid UTF-8 byte sequence returns 400 invalid_request", async () => {
  const { POST } = await import("../app/api/check/route");
  const invalidUtf8 = new Uint8Array([0x7b, 0x22, 0x74, 0xff, 0xfe, 0x22, 0x7d]); // malformed bytes, not valid UTF-8
  const response = await POST(checkRequest(invalidUtf8, "203.0.113.19"));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "invalid_request" });
});

test("successful request returns 200 with the documented response shape and no-store caching", async () => {
  const { POST } = await import("../app/api/check/route");
  const response = await POST(checkRequest(JSON.stringify({ text: "The Seoul Metro base fare is 1400 won for adults.", locale: "en" }), "203.0.113.20"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.equal(body.summary.total, 1);
  assert.equal(body.sentences.length, 1);
  assert.equal(body.sentences[0].match.claim_id, "metro-fare");
  assert.equal(
    body.summary.total,
    body.summary.verified + body.summary.needs_review + body.summary.disputed + body.summary.not_found,
  );
});

test("analytics logging failure still returns 200 (analytics never blocks the response)", async () => {
  const { POST } = await import("../app/api/check/route");
  const originalLog = console.log;
  const originalError = console.error;
  console.log = () => {
    throw new Error("simulated analytics sink failure");
  };
  console.error = () => {};
  try {
    const response = await POST(checkRequest(JSON.stringify({ text: "The Seoul Metro base fare is 1400 won for adults.", locale: "en" }), "203.0.113.21"));
    assert.equal(response.status, 200);
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
});

test("privacy: no log call during a request contains the submitted sentence text", async () => {
  const { POST } = await import("../app/api/check/route");
  const secretSentence = "This exact sentence text must never appear in any log line xyzzy12345.";
  const originalLog = console.log;
  const originalError = console.error;
  const loggedStrings: string[] = [];
  const capture = (...args: unknown[]) => {
    loggedStrings.push(args.map(String).join(" "));
  };
  console.log = capture;
  console.error = capture;
  try {
    await POST(checkRequest(JSON.stringify({ text: secretSentence, locale: "en" }), "203.0.113.22"));
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
  for (const line of loggedStrings) {
    assert.ok(!line.includes("This exact sentence text"), `sentence text leaked into a log line: ${line}`);
  }
});

test("rate limiting: exceeding the per-IP window returns 429 with Retry-After", async () => {
  const { POST } = await import("../app/api/check/route");
  const ip = "203.0.113.99";
  const body = JSON.stringify({ text: "The Seoul Metro base fare is 1400 won for adults.", locale: "en" });

  let lastResponse: Response | null = null;
  for (let i = 0; i < 12; i += 1) {
    lastResponse = await POST(checkRequest(body, ip));
  }

  assert.ok(lastResponse);
  assert.equal(lastResponse!.status, 429);
  assert.deepEqual(await lastResponse!.json(), { error: "rate_limited" });
  assert.ok(lastResponse!.headers.get("Retry-After"));
});
