import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyAIProviderError,
  resolveFallbackOrder,
  shouldFallbackForFailure,
} from "../lib/ai-fallback";

test("classifies quota, rate-limit, context and transient provider failures", () => {
  assert.equal(classifyAIProviderError("HTTP 429: RESOURCE_EXHAUSTED"), "rate_limit");
  assert.equal(classifyAIProviderError("insufficient_quota: monthly quota exceeded"), "quota_or_credit");
  assert.equal(classifyAIProviderError("HTTP 400: maximum context length exceeded"), "context_limit");
  assert.equal(classifyAIProviderError("HTTP 503: service unavailable"), "provider_unavailable");
  assert.equal(classifyAIProviderError("request timed out"), "timeout");
  assert.equal(classifyAIProviderError("HTTP 401: invalid API key"), "auth_or_key");
});

test("does not fan out malformed requests by default", () => {
  assert.equal(classifyAIProviderError("HTTP 422: unprocessable entity"), "bad_request");
  assert.equal(shouldFallbackForFailure("bad_request"), false);
  assert.equal(shouldFallbackForFailure("bad_request", { fallbackOnBadRequest: true }), true);
  assert.equal(shouldFallbackForFailure("rate_limit"), true);
});

test("resolves env priority and appends other configured providers", () => {
  const order = resolveFallbackOrder(
    undefined,
    ["gpt", "gemini", "perplexity"],
    "gemini,gpt,not-a-provider"
  );
  assert.deepEqual(order, ["gemini", "gpt", "perplexity"]);
});

test("explicit priority overrides env order and ignores unavailable providers", () => {
  const order = resolveFallbackOrder(
    ["perplexity", "gpt", "gemini"],
    ["gpt", "gemini"],
    "gemini,gpt"
  );
  assert.deepEqual(order, ["gpt", "gemini"]);
});
