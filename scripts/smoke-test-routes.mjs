#!/usr/bin/env node

/**
 * GYEOL MVP route smoke test.
 *
 * Usage:
 *   node scripts/smoke-test-routes.mjs [BASE_URL]
 *
 * BASE_URL defaults to http://localhost:3000.
 * Each route is checked for HTTP 200.
 * Exit code 0 = all pass, 1 = at least one failure.
 */

const BASE = (process.argv[2] || "http://localhost:3000").replace(/\/+$/, "");

const SLUGS = [
  "myungdong-laluce-parking",
  "cj-logistics-jeju-delivery",
  "coupang-rocket-food-refund",
  "passport-reissue-fee",
  "skt-youth-plan-data",
  "kakaobank-overseas-transfer-fee",
  "baemin-minimum-order",
];

const ROUTES = [
  "/",
  ...SLUGS.flatMap((s) => [
    `/ko/wiki/${s}`,
    `/api/documents/${s}`,
    `/raw/${s}.md`,
    `/report/${s}`,
    `/hallucination/${s}`,
  ]),
  `/diagnostics/${SLUGS[0]}`,
  "/admin/review",
  "/admin/new-entity",
  "/admin/new-document",
  "/admin/import",
  "/sitemap.xml",
  "/robots.txt",
];

let failures = 0;

for (const route of ROUTES) {
  const url = `${BASE}${route}`;
  try {
    const res = await fetch(url, { redirect: "follow" });
    const ok = res.status === 200;
    console.log(`${ok ? "PASS" : "FAIL"} ${res.status} ${route}`);
    if (!ok) failures++;
  } catch (err) {
    console.log(`FAIL ERR ${route} — ${err.message}`);
    failures++;
  }
}

console.log(`\n${ROUTES.length - failures}/${ROUTES.length} passed`);
process.exit(failures > 0 ? 1 : 0);
