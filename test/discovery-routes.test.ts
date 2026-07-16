import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Task 4 discovery wiring (bible v7 section 9.4) touches several files that
// can't run under plain node --test (Next.js metadata routes, middleware
// with next/server types) — reading source and asserting on it mirrors
// test/og-image-renderer.test.ts's route-config assertions from Task 3.

function read(path: string): string {
  return readFileSync(path, "utf8");
}

test("feed.xml and changelog.xml routes declare a 600s revalidate and the RSS content type", () => {
  for (const file of ["app/feed.xml/route.ts", "app/changelog.xml/route.ts"]) {
    const src = read(file);
    assert.match(src, /export const revalidate = 600;/, `${file} must revalidate every 600s`);
    assert.match(src, /application\/rss\+xml; charset=utf-8/, `${file} must set the RSS content type`);
    assert.match(src, /cache-control.*max-age=600/i, `${file} must cache for 600s`);
  }
});

test("feed.xml is verified-only and limited to the latest 50 items", () => {
  const src = read("app/feed.xml/route.ts");
  assert.match(src, /statuses:\s*\["verified"\]/, "feed.xml must only include verified transitions");
  assert.match(src, /limit:\s*50/, "feed.xml must cap at the latest 50 items");
});

test("changelog.xml covers verified, needs_review, and disputed transitions", () => {
  const src = read("app/changelog.xml/route.ts");
  assert.match(src, /"verified",\s*"needs_review",\s*"disputed"/);
});

test("sitemap includes /changelog and every locale's /check, but excludes feed.xml and changelog.xml", () => {
  const src = read("app/sitemap.ts");
  assert.match(src, /siteUrl\("\/changelog"\)/);
  assert.match(src, /siteUrl\(`\/\$\{locale\}\/check`\)/);
  // Comments are allowed to mention feed.xml/changelog.xml (explaining the
  // exclusion); only an actual siteUrl(...) call would add them as entries.
  assert.doesNotMatch(src, /siteUrl\("\/feed\.xml"\)/, "feed.xml is discovery-only and must not be duplicated into the sitemap");
  assert.doesNotMatch(src, /siteUrl\("\/changelog\.xml"\)/, "changelog.xml is discovery-only and must not be duplicated into the sitemap");
});

test("robots does not block any path (feed/changelog stay crawlable)", () => {
  const src = read("app/robots.ts");
  assert.match(src, /allow:\s*"\/"/);
  assert.doesNotMatch(src, /disallow/i);
});

test("root layout declares RSS alternates for feed.xml and changelog.xml", () => {
  const src = read("app/layout.tsx");
  assert.match(src, /"application\/rss\+xml"/);
  assert.match(src, /siteUrl\("\/feed\.xml"\)/);
  assert.match(src, /siteUrl\("\/changelog\.xml"\)/);
});

test("site footer links to the RSS feed and changelog", () => {
  const src = read("app/components/SiteFooter.tsx");
  assert.match(src, /localize\("\/feed\.xml"\)/);
  assert.match(src, /localize\("\/changelog"\)/);
});

test("llms.txt entry points mention the RSS feed and changelog", () => {
  const src = read("app/llms.txt/route.ts");
  assert.match(src, /siteUrl\("\/feed\.xml"\)/);
  assert.match(src, /siteUrl\("\/changelog"\)/);
  assert.match(src, /siteUrl\("\/changelog\.xml"\)/);
});

test("middleware skips locale redirect handling for dotted paths, so /feed.xml and /changelog.xml are never redirected", () => {
  const src = read("middleware.ts");
  assert.match(src, /pathname\.includes\("\."\)/, "middleware must treat any dotted path as a static/file route it does not touch");
});

test("changelog page groups events by UTC calendar date and caps the accumulated list at 300", () => {
  const src = read("app/changelog/page.tsx");
  assert.match(src, /isoTimestamp\.slice\(0,\s*10\)/, "date grouping must slice the UTC ISO timestamp, not a locale-formatted date");
  assert.match(src, /CHANGELOG_PAGE_LIMIT\s*=\s*300/);
  assert.match(src, /isChangelogStatus/, "status query params must be validated, not passed through raw");
  assert.match(src, /cursor-based/i, "must document the future cursor-pagination migration path");
  assert.match(src, /migration path/i, "must document the future cursor-pagination migration path");
});

test("changelog page localizes status labels instead of hardcoding English", () => {
  const src = read("app/changelog/page.tsx");
  assert.match(src, /getTranslations\(locale\)\.citation/);
});
