import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import nextConfig from "../next.config";
import { middleware } from "../middleware";
import { GET as getBadge } from "../app/api/badge/[slug]/route";
import {
  badgeCacheControl,
  buildBadgeMarkdown,
  buildBadgeSnippet,
  renderBadgeSvg,
  resolveBadgeView,
} from "../lib/citation-badge";
import { presentationForKey, type PresentationKey } from "../lib/citation-presentation";

const PRESENTATION_KEYS: PresentationKey[] = ["verified", "needs_review", "disputed", "unknown", "unavailable"];

test("every presentation key renders a self-contained SVG using only its whitelisted label", () => {
  for (const key of PRESENTATION_KEYS) {
    const svg = renderBadgeSvg(key);
    const label = presentationForKey(key).machineLabel;
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.match(svg, new RegExp(`For-Ai fact status: ${label}`));
    assert.match(svg, /<\/svg>$/);
    assert.doesNotMatch(svg, /<script|javascript:|onload=/i);
  }
});

test("missing documents resolve to a non-citable Unknown badge instead of throwing", async () => {
  const view = await resolveBadgeView("missing", async () => null);
  assert.equal(view.state, "missing");
  assert.equal(view.statusKey, "unknown");
  assert.equal(view.canCite, false);
});

test("loader errors resolve to a non-citable Unavailable badge", async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const view = await resolveBadgeView("broken", async () => { throw new Error("database unavailable"); });
    assert.equal(view.state, "error");
    assert.equal(view.statusKey, "unavailable");
    assert.equal(view.canCite, false);
  } finally {
    console.error = originalError;
  }
});

test("badge API keeps a missing image valid with 200/SVG and bounded caching", async () => {
  const response = await getBadge(
    new Request("https://example.test/api/badge/definitely-not-a-real-slug"),
    { params: Promise.resolve({ slug: "definitely-not-a-real-slug" }) },
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/svg+xml; charset=utf-8");
  assert.equal(response.headers.get("cache-control"), "public, max-age=300, s-maxage=300");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-for-ai-status"), "Unknown");
  assert.match(await response.text(), />Unknown</);
});

test("cache policy distinguishes normal, missing, and unavailable results", () => {
  assert.equal(badgeCacheControl("existing"), "public, max-age=600, s-maxage=600");
  assert.equal(badgeCacheControl("missing"), "public, max-age=300, s-maxage=300");
  assert.equal(badgeCacheControl("error"), "no-store");
});

test("embed route receives the complete and only frame-ancestor exception", async () => {
  assert.equal(typeof nextConfig.headers, "function");
  const headers = await nextConfig.headers!();
  assert.deepEqual(headers, [{
    source: "/embed/:path*",
    headers: [
      { key: "Content-Security-Policy", value: "frame-ancestors *" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
    ],
  }]);
  assert.equal(headers.flatMap((entry) => entry.headers).filter((header) => header.key === "Content-Security-Policy").length, 1);
  assert.equal(headers.flatMap((entry) => entry.headers).some((header) => header.key === "X-Frame-Options"), false);
});

test("middleware never locale-redirects an embed request", () => {
  const response = middleware(new NextRequest("https://example.test/embed/example", {
    headers: { "accept-language": "ko-KR" },
  }));
  assert.equal(response.headers.get("location"), null);
});

test("copy snippets are sandboxed, lazy, popup-capable, and encode untrusted slugs", () => {
  const snippet = buildBadgeSnippet('bad\" onload=\"alert(1)');
  assert.match(snippet, /height="140"/);
  assert.match(snippet, /sandbox="allow-popups allow-popups-to-escape-sandbox"/);
  assert.match(snippet, /loading="lazy"/);
  assert.match(snippet, /referrerpolicy="strict-origin-when-cross-origin"/);
  assert.match(snippet, /bad%22%20onload%3D%22alert\(1\)/);
  assert.doesNotMatch(snippet, / onload=/);

  const markdown = buildBadgeMarkdown("example-slug");
  assert.match(markdown, /^\[!\[For-Ai fact status\]\(.+\/api\/badge\/example-slug\)\]\(.+\/en\/wiki\/example-slug\)$/);
});
