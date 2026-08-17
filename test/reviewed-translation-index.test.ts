import assert from "node:assert/strict";
import test from "node:test";
import { buildReviewedTranslationRecord } from "../lib/i18n/reviewed-translation-record";
import {
  buildReviewedTranslationIndex,
  findReviewedTranslationByProvenanceKey,
} from "../lib/i18n/reviewed-translation-index";

function reviewed(locale: "ko" | "en", messageKey: string, sourceRevision: string) {
  const result = buildReviewedTranslationRecord({
    messageKey,
    translatedText: locale === "ko" ? "검증된 번역" : "Reviewed translation",
    provenance: {
      locale,
      sourceLocale: locale === "ko" ? "en" : "ko",
      sourceRevision,
      reviewer: "owner-review-fixture",
      reviewedAt: "2026-08-17T12:00:00.000Z",
    },
  });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error(result.reason);
  return result.value;
}

test("indexes reviewed translations by locale/message and provenance key", () => {
  const ko = reviewed("ko", "methodology.title", "rev-1");
  const en = reviewed("en", "methodology.title", "rev-2");
  const result = buildReviewedTranslationIndex([ko, en]);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error(result.reason);
  assert.equal(result.value.byLocaleMessage.get("ko:methodology.title")?.translatedText, ko.translatedText);
  assert.equal(findReviewedTranslationByProvenanceKey(result.value, en.provenanceKey)?.translatedText, en.translatedText);
});

test("fails closed on duplicate locale/message records", () => {
  const first = reviewed("ko", "methodology.title", "rev-1");
  const second = reviewed("ko", "methodology.title", "rev-2");
  assert.deepEqual(buildReviewedTranslationIndex([first, second]), {
    ok: false,
    reason: "duplicate_locale_message",
  });
});

test("fails closed when the same provenance event is reused", () => {
  const first = reviewed("ko", "methodology.title", "rev-1");
  const reused = { ...first, messageKey: "methodology.subtitle" };
  assert.deepEqual(buildReviewedTranslationIndex([first, reused]), {
    ok: false,
    reason: "duplicate_provenance_key",
  });
});
