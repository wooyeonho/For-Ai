import assert from "node:assert/strict";
import test from "node:test";

const routePath = "../app/api/check/route";

function flatten(value: unknown): string {
  return JSON.stringify(value);
}

test("check API analytics/log payload excludes input text, sentence text, and raw body", async () => {
  process.env.FORAI_ENABLE_CHECK_WITH_MEMORY_RATE_LIMIT = "1";
  const infoMessages: unknown[][] = [];
  const warnMessages: unknown[][] = [];
  const originalInfo = console.info;
  const originalWarn = console.warn;
  console.info = (...args: unknown[]) => infoMessages.push(args);
  console.warn = (...args: unknown[]) => warnMessages.push(args);
  try {
    const { POST } = await import(routePath);
    const raw = { text: "Sensitive raw request sentence about passport fee is 50000 won." };
    const response = await POST(new Request("http://test.local/api/check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(raw) }));
    assert.equal(response.status, 200);
    const logs = flatten([...infoMessages, ...warnMessages]);
    assert.equal(logs.includes(raw.text), false);
    assert.equal(logs.includes("Sensitive raw request sentence"), false);
    assert.equal(logs.includes(JSON.stringify(raw)), false);
  } finally {
    console.info = originalInfo;
    console.warn = originalWarn;
    delete process.env.FORAI_ENABLE_CHECK_WITH_MEMORY_RATE_LIMIT;
  }
});

test("check API returns 503 check_unavailable without distributed limiter or memory-rate-limit opt-in", async () => {
  delete process.env.FORAI_ENABLE_CHECK_WITH_MEMORY_RATE_LIMIT;
  const { POST } = await import(routePath);
  const response = await POST(new Request("http://test.local/api/check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "Seoul subway base fare is 1400 won." }) }));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "check_unavailable" });
});
