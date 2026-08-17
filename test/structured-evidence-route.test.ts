import assert from "node:assert/strict";
import test from "node:test";
import { createStructuredEvidenceRoute } from "../lib/i18n/structured-evidence-route";

test("returns explicit 404 when provider has no reviewed record", async () => {
  const handle = createStructuredEvidenceRoute(async () => []);
  const response = await handle("ko", "methodology.title");
  assert.deepEqual(response, { status: 404, body: { error: "reviewed_translation_not_found" } });
});

test("fails closed when reviewed-record provider is unavailable", async () => {
  const handle = createStructuredEvidenceRoute(async () => { throw new Error("provider_down"); });
  const response = await handle("ko", "methodology.title");
  assert.deepEqual(response, { status: 503, body: { error: "reviewed_translation_provider_unavailable" } });
});
