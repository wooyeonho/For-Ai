import assert from "node:assert/strict";
import test from "node:test";
import { buildReviewedTranslationRecord } from "../lib/i18n/reviewed-translation-record";
import { buildReviewedTranslationIndex } from "../lib/i18n/reviewed-translation-index";
import { projectReviewedTranslationEvidence } from "../lib/i18n/structured-evidence-projection";

test("projects only indexed reviewed translation evidence with provenance", () => {
  const built = buildReviewedTranslationRecord({
    messageKey: "methodology.title",
    translatedText: "검증 방법",
    provenance: {
      locale: "ko",
      sourceLocale: "en",
      sourceRevision: "rev-42",
      reviewer: "owner-review-fixture",
      reviewedAt: "2026-08-17T12:00:00.000Z",
    },
  });
  assert.equal(built.ok, true);
  if (!built.ok) throw new Error("fixture failed");
  const indexed = buildReviewedTranslationIndex([built.value]);
  assert.equal(indexed.ok, true);
  if (!indexed.ok) throw new Error("index failed");

  const projected = projectReviewedTranslationEvidence(indexed.value, " KO ", " methodology.title ");
  assert.equal(projected?.translatedText, "검증 방법");
  assert.equal(projected?.sourceRevision, "rev-42");
  assert.equal(projected?.provenanceKey, built.value.provenanceKey);
  assert.equal(projectReviewedTranslationEvidence(indexed.value, "ko", "missing.key"), null);
  assert.equal(projectReviewedTranslationEvidence(indexed.value, "", "methodology.title"), null);
});
