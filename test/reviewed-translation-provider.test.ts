import test from "node:test";
import assert from "node:assert/strict";
import {
  createReviewedTranslationSourceProvider,
  parseReviewedTranslationProviderJson,
} from "../lib/i18n/reviewed-translation-provider";

test("provider fails closed for empty or malformed input", () => {
  assert.deepEqual(parseReviewedTranslationProviderJson(undefined), { ok: false, reason: "provider_empty" });
  assert.deepEqual(parseReviewedTranslationProviderJson("{"), { ok: false, reason: "provider_invalid_json" });
  assert.deepEqual(parseReviewedTranslationProviderJson("{}"), { ok: false, reason: "provider_not_array" });
});

test("provider recomputes reviewed provenance and rejects unreviewed records", () => {
  const invalid = parseReviewedTranslationProviderJson(JSON.stringify([{ messageKey: "method.title", translatedText: "검증 방법", provenance: { locale: "ko", sourceLocale: "en" } }]));
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.equal(invalid.reason, "provider_record_invalid");

  const valid = parseReviewedTranslationProviderJson(JSON.stringify([{ messageKey: "method.title", translatedText: "검증 방법", provenance: { locale: "ko", sourceLocale: "en", sourceName: "methodology-canonical", sourceRevision: "rev-20260818", reviewer: "reviewer-1", reviewedAt: "2026-08-17T15:00:00Z" }, provenanceKey: "attacker-controlled" }]));
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.equal(valid.records.length, 1);
    assert.notEqual(valid.records[0].provenanceKey, "attacker-controlled");
    assert.match(valid.records[0].provenanceKey, /^en\|ko\|rev-20260818\|reviewer-1\|/);
  }
});

test("source provider refuses reviewed records from a different revision or source identity", async () => {
  const raw = JSON.stringify([{ messageKey: "method.title", translatedText: "검증 방법", provenance: { locale: "ko", sourceLocale: "en", sourceName: "methodology-canonical", sourceRevision: "rev-20260818", reviewer: "reviewer-1", reviewedAt: "2026-08-17T15:00:00Z" } }]);
  const matching = createReviewedTranslationSourceProvider({ readSource: async () => raw, expectedSourceRevision: "rev-20260818", expectedSourceName: "methodology-canonical" });
  assert.equal((await matching())[0].provenance.sourceRevision, "rev-20260818");

  const stale = createReviewedTranslationSourceProvider({ readSource: async () => raw, expectedSourceRevision: "rev-20260819", expectedSourceName: "methodology-canonical" });
  await assert.rejects(stale(), /provider_source_revision_mismatch/);

  const wrongSource = createReviewedTranslationSourceProvider({ readSource: async () => raw, expectedSourceRevision: "rev-20260818", expectedSourceName: "unreviewed-copy-paste" });
  await assert.rejects(wrongSource(), /provider_source_name_mismatch/);
});
