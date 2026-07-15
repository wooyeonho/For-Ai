import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
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

// A permanent (308) redirect is cached by browsers indefinitely, so every
// destination must be reachable (HTTP 200) independent of runtime feature
// flags. This was manually verified end-to-end with `next start` under both
// ENABLE_EXPERIMENTAL_GAMIFICATION unset and ="true"; these source-level
// guards keep that invariant from silently regressing.
test("contributors redirect target has no feature-flag gate", () => {
  const source = readFileSync(
    // __dirname resolves inside the compiled .tmp/tests mirror, which sits
    // two levels below the real repo root; page.tsx is never copied there
    // since it isn't part of the tsc test-compile file list.
    path.join(__dirname, "..", "..", "..", "app", "[locale]", "contributors", "page.tsx"),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /experimentalGamificationEnabled/,
    "contributors index must render for every supported locale regardless of any feature flag",
  );
});

test("leaderboard redirect target never notFound()s on the experimental flag", () => {
  const source = readFileSync(
    path.join(__dirname, "..", "..", "..", "app", "[locale]", "leaderboard", "page.tsx"),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /if\s*\(!experimentalGamificationEnabled\(\)\)\s*notFound\(\)/,
    "leaderboard must render 200 with the ranking section hidden, not notFound(), when the flag is off",
  );
  assert.match(
    source,
    /rankingNotYetEnabled/,
    "leaderboard must show a stable, flag-off explanation instead of empty/missing content",
  );
});

// Task 0-B: the legacy gamification page files are removed once Task 0-A's
// 308 redirects are the only way to reach these routes. Direct route files
// must never come back, or they would shadow the config-level redirect.
test("Task 0-B: legacy gamification route files no longer exist", () => {
  const repoRoot = path.join(__dirname, "..", "..", "..");
  for (const from of ["quests", "missions", "bounties", "challenges", "campaigns"]) {
    const routeDir = path.join(repoRoot, "app", "[locale]", from);
    assert.equal(existsSync(routeDir), false, `app/[locale]/${from} must be deleted (Task 0-B)`);
  }
});
