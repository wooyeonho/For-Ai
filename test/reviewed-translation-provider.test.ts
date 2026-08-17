import test from "node:test";
import assert from "node:assert/strict";
import {
  createReviewedTranslationSourceProvider,
  parseReviewedTranslationProviderJson,
  validateReviewedTranslationHistory,
} from "../lib/i18n/reviewed-translation-provider";
import { getTranslationProvenanceKey } from "../lib/i18n/translation-provenance";

test("provider fails closed for empty or malformed input", () => {
  assert.deepEqual(parseReviewedTranslationProviderJson(undefined), { ok: false, reason: "provider_empty" });
  assert.deepEqual(parseReviewedTranslationProviderJson("{"), { ok: false, reason: "provider_invalid_json" });
  assert.deepEqual(parseReviewedTranslationProviderJson("{}"), { ok: false, reason: "provider_not_array" });
});

test("provider recomputes reviewed provenance and rejects unreviewed records", () => {
  const invalid = parseReviewedTranslationProviderJson(JSON.stringify([{ messageKey: "method.title", translatedText: "검증 방법", provenance: { locale: "ko", sourceLocale: "en" } }]));
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.equal(invalid.reason, "provider_record_invalid");

  const valid = parseReviewedTranslationProviderJson(JSON.stringify([{ messageKey: "method.title", translatedText: "검증 방법", provenance: { locale: "ko", sourceLocale: "en", sourceRevision: "rev-20260818", reviewer: "reviewer-1", reviewedAt: "2026-08-17T15:00:00Z" }, provenanceKey: "attacker-controlled" }]));
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.equal(valid.records.length, 1);
    assert.notEqual(valid.records[0].provenanceKey, "attacker-controlled");
    assert.match(valid.records[0].provenanceKey, /^en\|ko\|rev-20260818\|reviewer-1\|/);
  }
});

test("provider rejects conflicting records for the same locale and message key", () => {
  const base = { locale: "ko", sourceLocale: "en", sourceRevision: "rev-20260818", reviewer: "reviewer-1", reviewedAt: "2026-08-17T15:00:00Z" };
  const conflicting = parseReviewedTranslationProviderJson(JSON.stringify([
    { messageKey: "method.title", translatedText: "검증 방법", provenance: base },
    { messageKey: "method.title", translatedText: "검증 방식", provenance: { ...base, reviewer: "reviewer-2" } },
  ]));
  assert.equal(conflicting.ok, false);
  if (!conflicting.ok) {
    assert.equal(conflicting.reason, "provider_record_conflict");
    assert.equal(conflicting.detail, "ko:method.title");
  }
});

test("history keeps one active reviewed record and requires explicit stale supersession linkage", () => {
  const oldParsed = parseReviewedTranslationProviderJson(JSON.stringify([{ messageKey: "method.title", translatedText: "검증 방법", provenance: { locale: "ko", sourceLocale: "en", sourceRevision: "rev-1", reviewer: "reviewer-1", reviewedAt: "2026-08-17T14:00:00Z" } }]));
  const newParsed = parseReviewedTranslationProviderJson(JSON.stringify([{ messageKey: "method.title", translatedText: "검증 방식", provenance: { locale: "ko", sourceLocale: "en", sourceRevision: "rev-2", reviewer: "reviewer-2", reviewedAt: "2026-08-18T00:00:00Z" } }]));
  assert.equal(oldParsed.ok, true);
  assert.equal(newParsed.ok, true);
  if (!oldParsed.ok || !newParsed.ok) return;

  const valid = validateReviewedTranslationHistory([
    { record: oldParsed.records[0], status: "superseded", supersededByProvenanceKey: newParsed.records[0].provenanceKey },
    { record: newParsed.records[0], status: "active" },
  ]);
  assert.equal(valid.ok, true);
  if (valid.ok) assert.equal(valid.activeRecords[0].provenanceKey, newParsed.records[0].provenanceKey);

  const staleUnlinked = validateReviewedTranslationHistory([
    { record: oldParsed.records[0], status: "superseded" },
    { record: newParsed.records[0], status: "active" },
  ]);
  assert.deepEqual(staleUnlinked, { ok: false, reason: "history_invalid_supersession", detail: "ko:method.title" });
});

test("source provider refuses reviewed records from a different revision or source locale", async () => {
  const raw = JSON.stringify([{ messageKey: "method.title", translatedText: "검증 방법", provenance: { locale: "ko", sourceLocale: "en", sourceRevision: "rev-20260818", reviewer: "reviewer-1", reviewedAt: "2026-08-17T15:00:00Z" } }]);
  const matching = createReviewedTranslationSourceProvider({ readSource: async () => raw, expectedSourceRevision: "rev-20260818", expectedSourceLocale: "en" });
  assert.equal((await matching())[0].provenance.sourceRevision, "rev-20260818");

  const stale = createReviewedTranslationSourceProvider({ readSource: async () => raw, expectedSourceRevision: "rev-20260819", expectedSourceLocale: "en" });
  await assert.rejects(stale(), /provider_source_revision_mismatch/);

  const wrongSourceLocale = createReviewedTranslationSourceProvider({ readSource: async () => raw, expectedSourceRevision: "rev-20260818", expectedSourceLocale: "ko" });
  await assert.rejects(wrongSourceLocale(), /provider_source_locale_mismatch/);
});

test("source provider can pin an exact reviewed provenance pair without trusting caller keys", async () => {
  const provenance = {
    locale: "ko" as const,
    sourceLocale: "en" as const,
    sourceRevision: "rev-20260818",
    reviewer: "reviewer-1",
    reviewedAt: "2026-08-17T15:00:00Z",
  };
  const raw = JSON.stringify([{ messageKey: "method.title", translatedText: "검증 방법", provenance, provenanceKey: "forged" }]);
  const expectedProvenanceKey = getTranslationProvenanceKey(provenance);

  const matching = createReviewedTranslationSourceProvider({
    readSource: async () => raw,
    expectedSourceRevision: provenance.sourceRevision,
    expectedSourceLocale: provenance.sourceLocale,
    expectedProvenanceKey,
  });
  assert.equal((await matching())[0].provenanceKey, expectedProvenanceKey);

  const wrongReviewerKey = getTranslationProvenanceKey({ ...provenance, reviewer: "reviewer-2" });
  const mismatched = createReviewedTranslationSourceProvider({
    readSource: async () => raw,
    expectedSourceRevision: provenance.sourceRevision,
    expectedSourceLocale: provenance.sourceLocale,
    expectedProvenanceKey: wrongReviewerKey,
  });
  await assert.rejects(mismatched(), /provider_provenance_key_mismatch/);
});
