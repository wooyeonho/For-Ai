import assert from "node:assert/strict";
import test from "node:test";
import { getMethodologyContent, METHODOLOGY_STEP_IDS } from "../lib/i18n/methodology-content";
import { SUPPORTED_LOCALES } from "../lib/i18n/locales";

test("methodology keeps one canonical semantic step model across locales", () => {
  assert.deepEqual(METHODOLOGY_STEP_IDS, ["atomic_claim", "source_observation", "human_verification"]);
  for (const locale of SUPPORTED_LOCALES) {
    const content = getMethodologyContent(locale);
    assert.deepEqual(content.orderedSteps.map((step) => step.id), METHODOLOGY_STEP_IDS);
    assert.equal(content.requestedLocale, locale);
    assert.ok(content.title.length > 20);
  }
});

test("Korean is localized and unsupported copy falls back explicitly to English", () => {
  const ko = getMethodologyContent("ko");
  assert.equal(ko.contentLocale, "ko");
  assert.equal(ko.fallback, false);

  const ja = getMethodologyContent("ja");
  assert.equal(ja.contentLocale, "en");
  assert.equal(ja.fallback, true);
});
