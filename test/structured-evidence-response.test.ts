import assert from "node:assert/strict";
import test from "node:test";
import { buildReviewedTranslationRecord } from "../lib/i18n/reviewed-translation-record";
import { buildReviewedTranslationIndex } from "../lib/i18n/reviewed-translation-index";
import { buildStructuredEvidenceResponse } from "../lib/i18n/structured-evidence-response";

test("returns 200 only for reviewed indexed evidence and 404 otherwise", () => {
  const built = buildReviewedTranslationRecord({
    messageKey: "methodology.title",
    translatedText: "검증 방법",
    provenance: {
      locale: "ko",
      sourceLocale: "en",
      sourceRevision: "rev-run-233322",
      reviewer: "automation-fixture-reviewer",
      reviewedAt: "2026-08-17T14:33:22.000Z",
    },
  });
  assert.equal(built.ok, true);
  if (!built.ok) throw new Error("fixture failed");
  const indexed = buildReviewedTranslationIndex([built.value]);
  assert.equal(indexed.ok, true);
  if (!indexed.ok) throw new Error("index failed");

  const ok = buildStructuredEvidenceResponse(indexed.value, "ko", "methodology.title");
  assert.equal(ok.status, 200);
  if (ok.status === 200) assert.equal(ok.body.provenanceKey, built.value.provenanceKey);

  const missing = buildStructuredEvidenceResponse(indexed.value, "ko", "methodology.missing");
  assert.deepEqual(missing, { status: 404, body: { error: "reviewed_translation_not_found" } });
});
