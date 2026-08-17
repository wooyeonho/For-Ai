import assert from "node:assert/strict";
import test from "node:test";
import { selectActiveReviewedTranslations, type ReviewedTranslationHistoryEntry } from "../lib/i18n/reviewed-translation-history";

function entry(key: string, lifecycle: "active" | "superseded", supersedesProvenanceKey?: string): ReviewedTranslationHistoryEntry {
  return {
    messageKey: "methodology.title",
    translatedText: key,
    provenanceKey: key,
    lifecycle,
    supersedesProvenanceKey,
    provenance: {
      locale: "en",
      sourceLocale: "ko",
      sourceRevision: "rev-1",
      reviewer: "reviewer@example.test",
      reviewedAt: "2026-08-18T00:00:00.000Z",
    },
  };
}

test("selects exactly one active reviewed translation while preserving superseded history", () => {
  const result = selectActiveReviewedTranslations([
    entry("old", "superseded"),
    entry("new", "active", "old"),
  ]);
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.active.map((record) => record.provenanceKey), ["new"]);
});

test("fails closed when two active records compete for one locale/message pair", () => {
  const result = selectActiveReviewedTranslations([entry("a", "active"), entry("b", "active")]);
  assert.deepEqual(result, { ok: false, reason: "history_active_conflict", detail: "en:methodology.title" });
});

test("rejects a supersession pointer unless the predecessor is explicitly superseded", () => {
  const result = selectActiveReviewedTranslations([entry("old", "active"), entry("new", "superseded", "old")]);
  assert.deepEqual(result, { ok: false, reason: "history_supersession_invalid", detail: "en:methodology.title" });
});
