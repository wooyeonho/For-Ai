import test from "node:test";
import assert from "node:assert/strict";
import { extractCanonicalText, hashCanonicalText } from "../lib/canonical-text";

test("extractCanonicalText strips script and style content entirely", () => {
  const html = `<html><head><style>body{color:red}</style></head><body><script>alert(1)</script><p>Real content.</p></body></html>`;
  const text = extractCanonicalText(html);
  assert.ok(!text.includes("alert"));
  assert.ok(!text.includes("color:red"));
  assert.ok(text.includes("Real content."));
});

test("extractCanonicalText drops nav/header/footer/aside boilerplate", () => {
  const html = `<body><header>Site Nav</header><nav>Menu</nav><article><p>The article body.</p></article><aside>Related links</aside><footer>Copyright</footer></body>`;
  const text = extractCanonicalText(html);
  assert.ok(!text.includes("Site Nav"));
  assert.ok(!text.includes("Menu"));
  assert.ok(!text.includes("Related links"));
  assert.ok(!text.includes("Copyright"));
  assert.ok(text.includes("The article body."));
});

test("extractCanonicalText decodes named and numeric entities", () => {
  const html = `<p>Tom &amp; Jerry &mdash; 50&#37; off &#x2013; today</p>`;
  const text = extractCanonicalText(html);
  assert.ok(text.includes("Tom & Jerry"));
  assert.ok(text.includes("50% off"));
  assert.ok(text.includes("–"));
});

test("extractCanonicalText inserts line breaks between block elements instead of fusing words", () => {
  const html = `<p>First paragraph.</p><p>Second paragraph.</p>`;
  const text = extractCanonicalText(html);
  assert.ok(!text.includes("paragraph.Second"));
  assert.ok(text.includes("First paragraph."));
  assert.ok(text.includes("Second paragraph."));
});

test("extractCanonicalText collapses runs of whitespace", () => {
  const html = `<p>Too    many     spaces</p>`;
  const text = extractCanonicalText(html);
  assert.equal(text, "Too many spaces");
});

test("hashCanonicalText is deterministic and content-sensitive", () => {
  const a = hashCanonicalText("hello world");
  const b = hashCanonicalText("hello world");
  const c = hashCanonicalText("hello world!");
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[0-9a-f]{64}$/);
});
