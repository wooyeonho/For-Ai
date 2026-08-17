import test from "node:test";
import assert from "node:assert/strict";
import { buildReviewedTranslationRecord } from "../lib/i18n/reviewed-translation-record";

test("requires complete real review provenance before creating a record", () => {
  const result = buildReviewedTranslationRecord({
    messageKey: "methodology.title",
    translatedText: "검증 방법",
    provenance: { locale: "ko", sourceLocale: "en", sourceRevision: "rev-1" },
  });
  assert.deepEqual(result, { ok: false, reason: "missing_reviewer" });
});

test("binds normalized translation data to deterministic reviewed provenance", () => {
  const result = buildReviewedTranslationRecord({
    messageKey: " methodology.title ",
    translatedText: " 검증 방법 ",
    provenance: {
      locale: "ko",
      sourceLocale: "en",
      sourceRevision: " rev-1 ",
      reviewer: " owner-review ",
      reviewedAt: "2026-08-17T12:00:00.000Z",
    },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.messageKey, "methodology.title");
  assert.equal(result.value.translatedText, "검증 방법");
  assert.equal(result.value.provenance.sourceRevision, "rev-1");
  assert.equal(result.value.provenanceKey, "en|ko|rev-1|owner-review|2026-08-17T12:00:00.000Z");
});

test("rejects a same-locale record masquerading as translation", () => {
  const result = buildReviewedTranslationRecord({
    messageKey: "methodology.title",
    translatedText: "For-Ai verification method",
    provenance: {
      locale: "en",
      sourceLocale: "en",
      sourceRevision: "rev-1",
      reviewer: "owner-review",
      reviewedAt: "2026-08-17T12:00:00.000Z",
    },
  });
  assert.deepEqual(result, { ok: false, reason: "translation_locale_matches_source" });
});
