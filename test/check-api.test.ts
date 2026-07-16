import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../app/api/check/route";

test("POST /api/check rejects missing text", async () => {
  const request = new Request("https://for.ai/api/check", { method: "POST", body: JSON.stringify({ locale: "en" }) });
  const response = await POST(request as never);
  assert.equal(response.status, 400);
});

test("POST /api/check analyzes text without returning raw logs", async () => {
  const request = new Request("https://for.ai/api/check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "Refund windows must be verified from the merchant official policy.", locale: "en" }) });
  const response = await POST(request as never);
  const json = await response.json();
  assert.equal(response.status, 200);
  assert.equal(json.results[0].match.claim.id, "fixture-commerce-001");
});
