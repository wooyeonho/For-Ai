import assert from "node:assert/strict";
import test from "node:test";
import nextConfig from "../next.config";
import { buildBadgeSnippet } from "../lib/citation-presentation";

test("badge snippet includes safe iframe attributes", () => {
  const snippet = buildBadgeSnippet("myungdong-laluce-parking");
  assert.match(snippet, /<iframe /);
  assert.match(snippet, /sandbox="allow-popups allow-popups-to-escape-sandbox"/);
  assert.match(snippet, /loading="lazy"/);
  assert.match(snippet, /referrerpolicy="strict-origin-when-cross-origin"/);
  assert.match(snippet, /\/embed\/myungdong-laluce-parking/);
});

test("embed route receives the only frame-ancestor exception", async () => {
  assert.equal(typeof nextConfig.headers, "function");
  const headers = await nextConfig.headers!();
  assert.deepEqual(headers, [
    {
      source: "/embed/:path*",
      headers: [
        { key: "Content-Security-Policy", value: "frame-ancestors *" },
      ],
    },
  ]);
});
