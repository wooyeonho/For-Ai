#!/usr/bin/env node

/**
 * For-Ai route smoke test.
 *
 * Usage:
 *   node scripts/smoke-test-routes.mjs [BASE_URL]
 *
 * BASE_URL defaults to http://localhost:3000.
 * Each route is checked for HTTP 200.
 * Exit code 0 = all pass, 1 = at least one failure.
 */

const BASE = (process.argv[2] || "http://localhost:3000").replace(/\/+$/, "");

const LOCALES = ["ko", "en", "hi", "ar", "es", "ja", "zh"];
const I18N_SMOKE_SLUG = "myungdong-laluce-parking";

const SLUGS = [
  "myungdong-laluce-parking",
  "cj-logistics-jeju-delivery",
  "coupang-rocket-food-refund",
  "passport-reissue-fee",
  "skt-youth-plan-data",
  "kakaobank-overseas-transfer-fee",
  "baemin-minimum-order",
  "er-night-visit-fee",
  "nhis-copay-cap",
  "seoul-metro-transfer-time",
  "expressway-seoul-busan-toll",
  "income-tax-filing-deadline",
  "move-in-report-deadline",
  "apartment-noise-standard",
  "seoul-recycling-schedule",
  "credit-card-overseas-fee",
  "jeonse-deposit-return",
  "csat-registration-period",
  "university-tuition-deadline",
  "kt-internet-cancellation-fee",
  "mvno-number-porting",
  "rental-report-requirement",
  "real-estate-brokerage-fee",
  "naverpay-refund-days",
  "11st-return-deadline",
  "nps-contribution-rate",
  "vehicle-tax-deadline",
  "taxi-night-surcharge",
  "health-checkup-eligibility",
  "resident-id-reissue",
  "unmanned-kiosk-hours",
  "mobile-micropayment-limit",
  "minimum-wage-hourly",
];

const ROUTES = [
  "/",
  // Task 0-A legacy gamification redirect targets must be real 200s
  // regardless of ENABLE_EXPERIMENTAL_GAMIFICATION — a permanent 308 must
  // never point at a route that can 404.
  "/en/contributors",
  "/ko/contributors",
  "/en/leaderboard",
  "/ko/leaderboard",
  ...LOCALES.flatMap((locale) => [
    `/${locale}/wiki/${I18N_SMOKE_SLUG}`,
    `/${locale}/wiki/${I18N_SMOKE_SLUG}/opengraph-image`,
    `/${locale}/wiki/${I18N_SMOKE_SLUG}/twitter-image`,
  ]),
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
  "/llms.txt",
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
