import type { ReviewedTranslationIndex } from "./reviewed-translation-index";
import { projectReviewedTranslationEvidence } from "./structured-evidence-projection";

export type StructuredEvidenceResponse =
  | { status: 200; body: NonNullable<ReturnType<typeof projectReviewedTranslationEvidence>> }
  | { status: 404; body: { error: "reviewed_translation_not_found" } };

export function buildStructuredEvidenceResponse(
  index: ReviewedTranslationIndex,
  locale: string,
  messageKey: string,
): StructuredEvidenceResponse {
  const evidence = projectReviewedTranslationEvidence(index, locale, messageKey);
  if (!evidence) {
    return { status: 404, body: { error: "reviewed_translation_not_found" } };
  }
  return { status: 200, body: evidence };
}
