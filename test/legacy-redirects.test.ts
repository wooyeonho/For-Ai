import assert from "node:assert/strict";
import test from "node:test";

import { SUPPORTED_LOCALES } from "../lib/i18n/locales";
import {
  LEGACY_GAMIFICATION_REDIRECTS,
  buildLegacyGamificationRedirects,
} from "../next.config";

const redirects = buildLegacyGamificationRedirects();

function matchSource(source: string, pathname: string): Record<string, string> | null {
  // Mirror of the Next.js path-to-regexp semantics we rely on:
  // /:locale(a|b|...)/<from>/:path*
  const m = source.match(/^\/:locale\(([^)]+)\)\/([^/]+)\/:path\*$/);
  assert.ok(m, `unexpected source shape: ${source}`);
  const [, localePattern, from] = m;
  const re = new RegExp(`^/(${localePattern})/${from}(?:/(.*))?$`);
  const hit = pathname.match(re);
  if (!hit) return null;
  return { locale: hit[1], path: hit[2] ?? "" };
}

test("every legacy gamification family redirects with HTTP 308 for every supported locale", () => {
  assert.equal(redirects.length, 5);
  const families = LEGACY_GAMIFICATION_REDIRECTS.map((r) => r.from);
  assert.deepEqual(families, ["quests", "missions", "bounties", "challenges", "campaigns"]);

  for (const redirect of redirects) {
    assert.equal(redirect.permanent, true, "permanent:true is required for HTTP 308");
    for (const locale of SUPPORTED_LOCALES) {
      const base = matchSource(redirect.source, `/${locale}/${redirect.source.split("/")[2]}`);
      assert.ok(base, `${redirect.source} must match base route for ${locale}`);
      assert.equal(base.locale, locale);
    }
  }
});

test("destinations map to the contracted targets", () => {
  const byFrom = new Map(
    redirects.map((r) => [r.source.split("/")[2], r.destination]),
  );
  assert.equal(byFrom.get("quests"), "/:locale/contributors");
  assert.equal(byFrom.get("missions"), "/:locale/contributors");
  assert.equal(byFrom.get("bounties"), "/:locale/leaderboard");
  assert.equal(byFrom.get("challenges"), "/:locale/leaderboard");
  assert.equal(byFrom.get("campaigns"), "/:locale", "campaigns goes to locale home");
});

test("nested legacy paths are covered by the same rule", () => {
  const bounties = redirects.find((r) => r.source.includes("/bounties/"));
  assert.ok(bounties);
  const nested = matchSource(bounties.source, "/ko/bounties/example");
  assert.ok(nested, "nested bounty path must match");
  assert.equal(nested.locale, "ko");
  assert.equal(nested.path, "example");
});

test("API, embed, and unsupported-locale paths never match", () => {
  for (const redirect of redirects) {
    assert.equal(matchSource(redirect.source, "/api/quests"), null);
    assert.equal(matchSource(redirect.source, "/embed/quests"), null);
    assert.equal(matchSource(redirect.source, "/quests"), null, "no bare (locale-less) match");
    assert.equal(matchSource(redirect.source, "/fr/quests"), null, "unsupported locale must not match");
    assert.equal(matchSource(redirect.source, "/kor/quests"), null, "locale pattern must not prefix-match");
  }
});

test("locale pattern is exactly the supported locale list", () => {
  for (const redirect of redirects) {
    const m = redirect.source.match(/^\/:locale\(([^)]+)\)\//);
    assert.ok(m);
    assert.deepEqual(m[1].split("|"), [...SUPPORTED_LOCALES]);
  }
});
