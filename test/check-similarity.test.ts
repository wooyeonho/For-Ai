import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { claimSimilarity, detectContradictionReasons, extractQuantities, tokenizeForCheck } from "../lib/check/similarity";
import { MATCH_THRESHOLD } from "../lib/check/candidates";
import type { SupportedLocale } from "../lib/i18n/locales";

// __dirname resolves inside the compiled .tmp/tests mirror, which sits two
// levels below the real repo root (see test/legacy-redirects.test.ts for the
// same pattern) — fixtures are never copied there, so read from the source tree.
function loadFixture(name: string): { cases: Array<Record<string, unknown>> } {
  const raw = readFileSync(path.join(__dirname, "..", "..", "..", "test", "fixtures", "claim-similarity", name), "utf8");
  return JSON.parse(raw);
}

test("tokenizeForCheck splits on Unicode letter/number runs and lowercases", () => {
  assert.deepEqual(tokenizeForCheck("The Fee is 1400-Won!"), ["the", "fee", "is", "1400", "won"]);
});

test("extractQuantities normalizes Arabic-Indic and Devanagari digits to ASCII", () => {
  const arabicIndic = extractQuantities("الرسوم هي ١٤٠٠ وون"); // 1400 in Arabic-Indic digits
  assert.equal(arabicIndic[0]?.normalizedValue, "1400");

  const devanagari = extractQuantities("शुल्क १४०० वॉन है"); // 1400 in Devanagari digits
  assert.equal(devanagari[0]?.normalizedValue, "1400");
});

test("extractQuantities classifies percent, currency, and year units from nearby context", () => {
  const percent = extractQuantities("the discount is 20% for students");
  assert.equal(percent[0]?.unit, "percent");

  const currency = extractQuantities("the fee is $50 for processing");
  assert.equal(currency[0]?.unit, "currency");

  const year = extractQuantities("the rule changed in 2023");
  assert.equal(year[0]?.unit, "year");
});

test("calibration fixture: MATCH_THRESHOLD separates expectMatch:true from expectMatch:false pairs", () => {
  const fixture = loadFixture("calibration.json");
  for (const testCase of fixture.cases) {
    const locale = testCase.locale as SupportedLocale;
    const similarity = claimSimilarity(testCase.sentence as string, testCase.candidateText as string, locale);
    if (testCase.expectMatch) {
      assert.ok(
        similarity >= MATCH_THRESHOLD,
        `[${testCase.id}] expected similarity >= ${MATCH_THRESHOLD}, got ${similarity.toFixed(3)}`,
      );
    } else {
      assert.ok(
        similarity < MATCH_THRESHOLD,
        `[${testCase.id}] expected similarity < ${MATCH_THRESHOLD}, got ${similarity.toFixed(3)}`,
      );
    }
  }
});

test("regression fixture: contradiction gate catches every non-knownLimitation hard-negative case", () => {
  const fixture = loadFixture("regression.json");
  for (const testCase of fixture.cases) {
    if (testCase.knownLimitation) continue;
    const locale = testCase.locale as SupportedLocale;
    const gate = detectContradictionReasons(testCase.sentence as string, testCase.candidateText as string, locale);
    assert.equal(gate, testCase.expectedGate, `[${testCase.id}] expected gate ${testCase.expectedGate}, got ${gate}`);
  }
});

test("regression fixture: knownLimitation cases are still open (documents the v1 heuristic gap, not a pass)", () => {
  const fixture = loadFixture("regression.json");
  const knownLimitationCases = fixture.cases.filter((c) => c.knownLimitation);
  assert.ok(knownLimitationCases.length > 0, "expected at least one documented known-limitation case");
  for (const testCase of knownLimitationCases) {
    const locale = testCase.locale as SupportedLocale;
    const gate = detectContradictionReasons(testCase.sentence as string, testCase.candidateText as string, locale);
    assert.equal(gate, "none", `[${testCase.id}] this case is expected to slip past the v1 gate (documents a known gap)`);
  }
});

test("holdout fixture: reports precision without ever adjusting MATCH_THRESHOLD from it", () => {
  const fixture = loadFixture("holdout.json");
  let correct = 0;
  for (const testCase of fixture.cases) {
    const locale = testCase.locale as SupportedLocale;
    const similarity = claimSimilarity(testCase.sentence as string, testCase.candidateText as string, locale);
    const predictedMatch = similarity >= MATCH_THRESHOLD;
    if (predictedMatch === testCase.expectMatch) correct += 1;
  }
  const precision = correct / fixture.cases.length;
  // Deliberately lower than calibration's 100% (calibration.json was used to
  // choose MATCH_THRESHOLD, so it's expected to score higher): this bound
  // exists to catch real regressions in claimSimilarity/MATCH_THRESHOLD, not
  // to be tuned up to match observed holdout performance over time.
  assert.ok(precision >= 0.7, `holdout precision regressed below 0.7: ${precision.toFixed(2)}`);
});

test("negation gate: identical claims differing only by negation are gated", () => {
  const gate = detectContradictionReasons("The fee is refundable.", "The fee is not refundable.", "en");
  assert.equal(gate, "negation_mismatch");
});

test("quantity gate: identical claims differing only by number are gated", () => {
  const gate = detectContradictionReasons("The fare is 1400 won.", "The fare is 1600 won.", "en");
  assert.equal(gate, "quantity_mismatch");
});

test("polarity gate: increase vs decrease with the same resulting number is gated", () => {
  const gate = detectContradictionReasons("The fare increased to 1400 won.", "The fare decreased to 1400 won.", "en");
  assert.equal(gate, "polarity_mismatch");
});

test("no gate fires for genuinely compatible restatements", () => {
  const gate = detectContradictionReasons(
    "The Seoul Metro base fare is 1400 won for adults.",
    "Seoul Metro base fare is 1400 won for adults with a transit card.",
    "en",
  );
  assert.equal(gate, "none");
});

test("extractQuantities classifies each occurrence of a repeated number independently, not just the first", () => {
  const quantities = extractQuantities("There are 50 people at the office and the fee is $50.");
  assert.equal(quantities.length, 2);
  assert.equal(quantities[0]?.unit, "people");
  assert.equal(quantities[1]?.unit, "currency");
});

test("extractQuantities narrows the unmarked-year fallback so a transit fare isn't classified as a year", () => {
  const fare = extractQuantities("The base fare is 1400 won.");
  assert.notEqual(fare[0]?.unit, "year");
  const year = extractQuantities("the rule changed in 2023");
  assert.equal(year[0]?.unit, "year");
});

test("extractQuantities keeps multi-group numbers as a single token", () => {
  const quantities = extractQuantities("The budget is 14,000,000 won this year.");
  assert.equal(quantities[0]?.normalizedValue, "14000000");
});

test("extractQuantities applies Spanish comma-decimal convention only for the es locale", () => {
  const es = extractQuantities("La comisión es del 1,5%.", "es");
  assert.equal(es[0]?.normalizedValue, "1.5");
  const en = extractQuantities("1,5", "en");
  assert.equal(en[0]?.normalizedValue, "15");
});

test("negation gate: curly apostrophe contractions are detected the same as straight apostrophes", () => {
  const gate = detectContradictionReasons("The fee is refundable.", "The fee isn’t refundable.", "en");
  assert.equal(gate, "negation_mismatch");
});

test("quantity gate: Spanish comma-decimal is no longer confused with a genuinely different integer percentage", () => {
  // Before the fix, both "1,5" (one and a half) and "15" (fifteen) stripped
  // their comma the same way and collided on normalizedValue "15", silently
  // missing a real contradiction.
  const gate = detectContradictionReasons("La comisión es del 1,5%.", "La comisión es del 15%.", "es");
  assert.equal(gate, "quantity_mismatch");
});
