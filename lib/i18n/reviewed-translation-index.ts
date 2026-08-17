import type { ReviewedTranslationRecord } from "./reviewed-translation-record";
import { parseAndSelectReviewedTranslationHistory } from "./reviewed-translation-provider";

export type ReviewedTranslationIndex = {
  byLocaleMessage: Map<string, ReviewedTranslationRecord>;
  byProvenanceKey: Map<string, ReviewedTranslationRecord>;
};

export function buildReviewedTranslationIndex(
  records: ReviewedTranslationRecord[],
): { ok: true; value: ReviewedTranslationIndex } | { ok: false; reason: string } {
  const byLocaleMessage = new Map<string, ReviewedTranslationRecord>();
  const byProvenanceKey = new Map<string, ReviewedTranslationRecord>();

  for (const record of records) {
    const localeMessageKey = `${record.provenance.locale}:${record.messageKey}`;
    if (byLocaleMessage.has(localeMessageKey)) {
      return { ok: false, reason: "duplicate_locale_message" };
    }
    if (byProvenanceKey.has(record.provenanceKey)) {
      return { ok: false, reason: "duplicate_provenance_key" };
    }
    byLocaleMessage.set(localeMessageKey, record);
    byProvenanceKey.set(record.provenanceKey, record);
  }

  return { ok: true, value: { byLocaleMessage, byProvenanceKey } };
}

export function buildReviewedTranslationHistoryIndex(raw: string | undefined):
  | { ok: true; value: ReviewedTranslationIndex }
  | { ok: false; reason: string; detail?: string } {
  const selected = parseAndSelectReviewedTranslationHistory(raw);
  if (!selected.ok) return selected;
  return buildReviewedTranslationIndex(selected.records);
}

export function findReviewedTranslationByProvenanceKey(
  index: ReviewedTranslationIndex,
  provenanceKey: string,
): ReviewedTranslationRecord | null {
  return index.byProvenanceKey.get(provenanceKey) ?? null;
}

export function findReviewedTranslation(
  index: ReviewedTranslationIndex,
  locale: string,
  messageKey: string,
): ReviewedTranslationRecord | null {
  const normalizedLocale = locale.trim().toLowerCase();
  const normalizedMessageKey = messageKey.trim();
  if (!normalizedLocale || !normalizedMessageKey) return null;
  return index.byLocaleMessage.get(`${normalizedLocale}:${normalizedMessageKey}`) ?? null;
}
