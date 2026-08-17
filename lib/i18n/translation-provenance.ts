import { isValidLocale, type SupportedLocale } from "./locales";

export type TranslationProvenance = {
  locale: SupportedLocale;
  sourceLocale: SupportedLocale;
  sourceRevision: string;
  reviewer: string;
  reviewedAt: string;
};

export function getTranslationProvenanceKey(input: TranslationProvenance): string {
  return [
    input.sourceLocale,
    input.locale,
    input.sourceRevision.trim(),
    input.reviewer.trim(),
    new Date(input.reviewedAt).toISOString(),
  ].join("|");
}

export function validateReviewedTranslationProvenance(
  input: Partial<TranslationProvenance>,
): { ok: true; value: TranslationProvenance; provenanceKey: string } | { ok: false; reason: string } {
  if (!input.locale || !isValidLocale(input.locale)) return { ok: false, reason: "invalid_locale" };
  if (!input.sourceLocale || !isValidLocale(input.sourceLocale)) return { ok: false, reason: "invalid_source_locale" };
  if (!input.sourceRevision?.trim()) return { ok: false, reason: "missing_source_revision" };
  if (!input.reviewer?.trim()) return { ok: false, reason: "missing_reviewer" };
  if (!input.reviewedAt || Number.isNaN(Date.parse(input.reviewedAt))) return { ok: false, reason: "invalid_reviewed_at" };
  if (new Date(input.reviewedAt).getTime() > Date.now() + 5 * 60_000) return { ok: false, reason: "future_reviewed_at" };

  const value: TranslationProvenance = {
    locale: input.locale,
    sourceLocale: input.sourceLocale,
    sourceRevision: input.sourceRevision.trim(),
    reviewer: input.reviewer.trim(),
    reviewedAt: new Date(input.reviewedAt).toISOString(),
  };

  return {
    ok: true,
    value,
    provenanceKey: getTranslationProvenanceKey(value),
  };
}
