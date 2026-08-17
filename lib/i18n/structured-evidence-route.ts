import { buildReviewedTranslationIndex } from "./reviewed-translation-index";
import type { ReviewedTranslationRecord } from "./reviewed-translation-record";
import { buildStructuredEvidenceResponse, type StructuredEvidenceResponse } from "./structured-evidence-response";

export type ReviewedRecordProvider = () => Promise<ReviewedTranslationRecord[]>;

export type StructuredEvidenceRouteResponse =
  | StructuredEvidenceResponse
  | { status: 409; body: { error: "reviewed_translation_index_invalid"; reason: string } }
  | { status: 503; body: { error: "reviewed_translation_provider_unavailable" } };

export function createStructuredEvidenceRoute(loadReviewedRecords: ReviewedRecordProvider) {
  return async function handleStructuredEvidence(locale: string, messageKey: string): Promise<StructuredEvidenceRouteResponse> {
    let records: ReviewedTranslationRecord[];
    try {
      records = await loadReviewedRecords();
    } catch {
      return { status: 503, body: { error: "reviewed_translation_provider_unavailable" } };
    }

    const index = buildReviewedTranslationIndex(records);
    if ("reason" in index) {
      return { status: 409, body: { error: "reviewed_translation_index_invalid", reason: index.reason } };
    }
    return buildStructuredEvidenceResponse(index.value, locale, messageKey);
  };
}
