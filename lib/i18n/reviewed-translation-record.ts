import {
  validateReviewedTranslationProvenance,
  type TranslationProvenance,
} from "./translation-provenance";

export type ReviewedTranslationRecord = {
  messageKey: string;
  translatedText: string;
  provenance: TranslationProvenance;
  provenanceKey: string;
};

export function buildReviewedTranslationRecord(input: {
  messageKey?: string;
  translatedText?: string;
  provenance?: Partial<TranslationProvenance>;
}):
  | { ok: true; value: ReviewedTranslationRecord }
  | { ok: false; reason: string } {
  const messageKey = input.messageKey?.trim();
  const translatedText = input.translatedText?.trim();
  if (!messageKey) return { ok: false, reason: "missing_message_key" };
  if (!translatedText) return { ok: false, reason: "missing_translated_text" };

  const reviewed = validateReviewedTranslationProvenance(input.provenance ?? {});
  if (reviewed.ok === false) return { ok: false, reason: reviewed.reason };
  if (reviewed.value.locale === reviewed.value.sourceLocale) {
    return { ok: false, reason: "translation_locale_matches_source" };
  }

  return {
    ok: true,
    value: {
      messageKey,
      translatedText,
      provenance: reviewed.value,
      provenanceKey: reviewed.provenanceKey,
    },
  };
}
