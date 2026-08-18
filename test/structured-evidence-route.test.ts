import assert from "node:assert/strict";
import test from "node:test";
import {
  createStructuredEvidenceHistoryRoute,
  createStructuredEvidenceRoute,
} from "../lib/i18n/structured-evidence-route";
import { parseReviewedTranslationProviderJson } from "../lib/i18n/reviewed-translation-provider";

test("returns explicit 404 when provider has no reviewed record", async () => {
  const handle = createStructuredEvidenceRoute(async () => []);
  const response = await handle("ko", "methodology.title");
  assert.deepEqual(response, { status: 404, body: { error: "reviewed_translation_not_found" } });
});

test("fails closed when reviewed-record provider is unavailable", async () => {
  const handle = createStructuredEvidenceRoute(async () => { throw new Error("provider_down"); });
  const response = await handle("ko", "methodology.title");
  assert.deepEqual(response, { status: 503, body: { error: "reviewed_translation_provider_unavailable" } });
});

test("history route serves active reviewed translation with bounded predecessor summary but no superseded content", async () => {
  const oldestRecord = {
    messageKey: "methodology.title",
    translatedText: "아주 옛 검증 방법",
    provenance: { locale: "ko", sourceLocale: "en", sourceRevision: "rev-0", reviewer: "reviewer-0", reviewedAt: "2026-08-17T10:00:00Z" },
  };
  const oldRecord = {
    messageKey: "methodology.title",
    translatedText: "옛 검증 방법",
    provenance: { locale: "ko", sourceLocale: "en", sourceRevision: "rev-1", reviewer: "reviewer-1", reviewedAt: "2026-08-17T14:00:00Z" },
  };
  const newRecord = {
    messageKey: "methodology.title",
    translatedText: "현재 검증 방법",
    provenance: { locale: "ko", sourceLocale: "en", sourceRevision: "rev-2", reviewer: "reviewer-2", reviewedAt: "2026-08-17T21:00:00Z" },
  };
  const parsedOldest = parseReviewedTranslationProviderJson(JSON.stringify([oldestRecord]));
  const parsedOld = parseReviewedTranslationProviderJson(JSON.stringify([oldRecord]));
  const parsedNew = parseReviewedTranslationProviderJson(JSON.stringify([newRecord]));
  assert.equal(parsedOldest.ok, true);
  assert.equal(parsedOld.ok, true);
  assert.equal(parsedNew.ok, true);
  if (!parsedOldest.ok || !parsedOld.ok || !parsedNew.ok) return;

  const rawHistory = JSON.stringify([
    { record: oldestRecord, status: "superseded", supersededByProvenanceKey: parsedOld.records[0].provenanceKey },
    { record: oldRecord, status: "superseded", supersededByProvenanceKey: parsedNew.records[0].provenanceKey },
    { record: newRecord, status: "active" },
  ]);
  const handle = createStructuredEvidenceHistoryRoute(async () => rawHistory);
  const response = await handle("ko", "methodology.title");

  assert.equal(response.status, 200);
  if (response.status === 200) {
    assert.equal(response.body.translatedText, "현재 검증 방법");
    assert.equal(response.body.provenanceKey, parsedNew.records[0].provenanceKey);
    assert.deepEqual(response.body.predecessorProvenanceKeys, [
      parsedOldest.records[0].provenanceKey,
      parsedOld.records[0].provenanceKey,
    ]);
    assert.equal(response.body.correctionCount, 2);
    assert.deepEqual(response.body.correctionDisclosure, {
      count: 2,
      scope: "provenance_keys_only",
      supersededContentIncluded: false,
      message: "Correction history exposes provenance-only predecessor keys; superseded content is not included.",
    });
    assert.ok((response.body.predecessorProvenanceKeys?.length ?? 0) <= 100);
    const serialized = JSON.stringify(response.body);
    for (const forbidden of ["아주 옛 검증 방법", "옛 검증 방법", "reviewer-0", "reviewer-1", "rev-0", "rev-1"]) {
      assert.equal(serialized.includes(forbidden), false);
    }
    assert.equal(response.body.sourceRevision, "rev-2");
  }
});

test("history route rejects invalid supersession instead of serving stale evidence", async () => {
  const rawHistory = JSON.stringify([{ record: { messageKey: "methodology.title", translatedText: "옛 검증 방법", provenance: { locale: "ko", sourceLocale: "en", sourceRevision: "rev-1", reviewer: "reviewer-1", reviewedAt: "2026-08-17T14:00:00Z" } }, status: "superseded" }]);
  const handle = createStructuredEvidenceHistoryRoute(async () => rawHistory);
  const response = await handle("ko", "methodology.title");
  assert.equal(response.status, 409);
});

test("history route rejects self-referential correction lineage", async () => {
  const record = { messageKey: "methodology.title", translatedText: "검증 방법", provenance: { locale: "ko", sourceLocale: "en", sourceRevision: "rev-cycle", reviewer: "reviewer-cycle", reviewedAt: "2026-08-18T11:03:37Z" } };
  const parsed = parseReviewedTranslationProviderJson(JSON.stringify([record]));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const rawHistory = JSON.stringify([
    { record, status: "superseded", supersededByProvenanceKey: parsed.records[0].provenanceKey },
    { record: { ...record, translatedText: "현재 검증 방법", provenance: { ...record.provenance, sourceRevision: "rev-current", reviewedAt: "2026-08-18T11:04:00Z" } }, status: "active" },
  ]);
  const response = await createStructuredEvidenceHistoryRoute(async () => rawHistory)("ko", "methodology.title");
  assert.equal(response.status, 409);
});
