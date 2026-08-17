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

test("history route serves only the active reviewed translation and excludes superseded provenance", async () => {
  const oldRecord = {
    messageKey: "methodology.title",
    translatedText: "옛 검증 방법",
    provenance: {
      locale: "ko",
      sourceLocale: "en",
      sourceRevision: "rev-1",
      reviewer: "reviewer-1",
      reviewedAt: "2026-08-17T14:00:00Z",
    },
  };
  const newRecord = {
    messageKey: "methodology.title",
    translatedText: "현재 검증 방법",
    provenance: {
      locale: "ko",
      sourceLocale: "en",
      sourceRevision: "rev-2",
      reviewer: "reviewer-2",
      reviewedAt: "2026-08-18T01:00:00Z",
    },
  };
  const parsedOld = parseReviewedTranslationProviderJson(JSON.stringify([oldRecord]));
  const parsedNew = parseReviewedTranslationProviderJson(JSON.stringify([newRecord]));
  assert.equal(parsedOld.ok, true);
  assert.equal(parsedNew.ok, true);
  if (!parsedOld.ok || !parsedNew.ok) return;

  const rawHistory = JSON.stringify([
    {
      record: oldRecord,
      status: "superseded",
      supersededByProvenanceKey: parsedNew.records[0].provenanceKey,
    },
    { record: newRecord, status: "active" },
  ]);
  const handle = createStructuredEvidenceHistoryRoute(async () => rawHistory);
  const response = await handle("ko", "methodology.title");

  assert.equal(response.status, 200);
  if (response.status === 200) {
    assert.equal(response.body.translatedText, "현재 검증 방법");
    assert.equal(response.body.provenanceKey, parsedNew.records[0].provenanceKey);
    assert.notEqual(response.body.provenanceKey, parsedOld.records[0].provenanceKey);
    assert.equal(response.body.sourceRevision, "rev-2");
  }
});

test("history route rejects invalid supersession instead of serving stale evidence", async () => {
  const rawHistory = JSON.stringify([
    {
      record: {
        messageKey: "methodology.title",
        translatedText: "옛 검증 방법",
        provenance: {
          locale: "ko",
          sourceLocale: "en",
          sourceRevision: "rev-1",
          reviewer: "reviewer-1",
          reviewedAt: "2026-08-17T14:00:00Z",
        },
      },
      status: "superseded",
    },
  ]);
  const handle = createStructuredEvidenceHistoryRoute(async () => rawHistory);
  const response = await handle("ko", "methodology.title");
  assert.equal(response.status, 409);
});
