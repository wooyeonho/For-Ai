import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";
import { GET as getFeed } from "../app/feed.xml/route";
import { GET as getChangelogXml } from "../app/changelog.xml/route";
import { GET as getChangelogApi } from "../app/api/changelog/route";

function assertWellFormedXml(body: string) {
  assert.match(body, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(body, /<rss version="2\.0"[^>]*>/);
  assert.match(body, /<\/rss>\s*$/);
  // Balanced <item>/</item> pairs (zero or more).
  const opens = (body.match(/<item>/g) ?? []).length;
  const closes = (body.match(/<\/item>/g) ?? []).length;
  assert.equal(opens, closes);
}

test("feed.xml is well-formed even with zero events, and never emits <language> for a multilingual channel", async () => {
  const response = await getFeed();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/rss+xml; charset=utf-8");
  assert.equal(response.headers.get("cache-control"), "public, max-age=600, s-maxage=600");
  const body = await response.text();
  assertWellFormedXml(body);
  assert.doesNotMatch(body, /<language>/);
  assert.match(body, /<atom:link href="[^"]+" rel="self" type="application\/rss\+xml" \/>/);
  assert.match(body, /<lastBuildDate>[^<]+<\/lastBuildDate>/);
});

test("changelog.xml is well-formed and supports a status filter query param", async () => {
  const response = await getChangelogXml(new Request("https://for-ai.example/changelog.xml?status=verified"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/rss+xml; charset=utf-8");
  const body = await response.text();
  assertWellFormedXml(body);
  assert.doesNotMatch(body, /<language>/);
  assert.match(body, /<atom:link href="[^"]+" rel="self" type="application\/rss\+xml" \/>/);
});

test("api/changelog validates limit and cursor instead of silently returning NaN/empty slices", async () => {
  const badLimit = await getChangelogApi(new Request("https://for-ai.example/api/changelog?limit=not-a-number"));
  assert.equal(badLimit.status, 200);
  const badLimitBody = await badLimit.json();
  assert.equal(badLimitBody.limit, 50);
  assert.ok(Array.isArray(badLimitBody.items));

  const overCap = await getChangelogApi(new Request("https://for-ai.example/api/changelog?limit=99999"));
  const overCapBody = await overCap.json();
  assert.equal(overCapBody.limit, 300);

  const badCursor = await getChangelogApi(new Request("https://for-ai.example/api/changelog?cursor=not-valid-base64url-json"));
  assert.equal(badCursor.status, 400);
  assert.equal(badCursor.headers.get("cache-control"), "no-store");
});

test("api/changelog ignores unrecognized status values rather than erroring", async () => {
  const response = await getChangelogApi(new Request("https://for-ai.example/api/changelog?status=not-a-real-status"));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(Array.isArray(body.items));
});

test("middleware does not intercept feed/changelog/api discovery routes with a locale redirect", () => {
  for (const path of ["/feed.xml", "/changelog.xml", "/api/changelog"]) {
    const response = middleware(new NextRequest(`https://for-ai.example${path}`, {
      headers: { "accept-language": "ko-KR" },
    }));
    assert.equal(response.headers.get("location"), null, `${path} should not be locale-redirected`);
  }
});
