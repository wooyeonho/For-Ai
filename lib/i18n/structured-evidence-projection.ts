import type { ReviewedTranslationIndex } from "./reviewed-translation-index";
import { findReviewedTranslation } from "./reviewed-translation-index";

export type ReviewedTranslationEvidenceProjection = {
  messageKey: string;
  locale: string;
  translatedText: string;
  provenanceKey: string;
  sourceLocale: string;
  sourceRevision: string;
  reviewer: string;
  reviewedAt: string;
};

export function projectReviewedTranslationEvidence(
  index: ReviewedTranslationIndex,
  locale: string,
  messageKey: string,
): ReviewedTranslationEvidenceProjection | null {
  const record = findReviewedTranslation(index, locale, messageKey);
  if (!record) return null;

  return {
    messageKey: record.messageKey,
    locale: record.provenance.locale,
    translatedText: record.translatedText,
    provenanceKey: record.provenanceKey,
    sourceLocale: record.provenance.sourceLocale,
    sourceRevision: record.provenance.sourceRevision,
    reviewer: record.provenance.reviewer,
    reviewedAt: record.provenance.reviewedAt,
  };
}
