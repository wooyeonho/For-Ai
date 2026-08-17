import { buildReviewedTranslationRecord, type ReviewedTranslationRecord } from "./reviewed-translation-record";
import type { TranslationProvenance } from "./translation-provenance";

export type ReviewedTranslationProviderResult =
  | { ok: true; records: ReviewedTranslationRecord[] }
  | { ok: false; reason: "provider_empty" | "provider_invalid_json" | "provider_not_array" | "provider_record_invalid"; detail?: string };

export function parseReviewedTranslationProviderJson(raw: string | undefined): ReviewedTranslationProviderResult {
  if (!raw?.trim()) return { ok: false, reason: "provider_empty" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "provider_invalid_json" };
  }

  if (!Array.isArray(parsed)) return { ok: false, reason: "provider_not_array" };

  const records: ReviewedTranslationRecord[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") {
      return { ok: false, reason: "provider_record_invalid", detail: "record_not_object" };
    }
    const candidate = item as Record<string, unknown>;
    const built = buildReviewedTranslationRecord({
      messageKey: typeof candidate.messageKey === "string" ? candidate.messageKey : undefined,
      translatedText: typeof candidate.translatedText === "string" ? candidate.translatedText : undefined,
      provenance:
        candidate.provenance && typeof candidate.provenance === "object"
          ? (candidate.provenance as Partial<TranslationProvenance>)
          : undefined,
    });
    if ("reason" in built) {
      return { ok: false, reason: "provider_record_invalid", detail: built.reason };
    }
    records.push(built.value);
  }

  return { ok: true, records };
}

export function createReviewedTranslationSourceProvider(input: {
  readSource: () => Promise<string | undefined>;
  expectedSourceRevision: string;
  expectedSourceName?: string;
}) {
  const expectedSourceRevision = input.expectedSourceRevision.trim();
  const expectedSourceName = input.expectedSourceName?.trim();
  if (!expectedSourceRevision) throw new Error("expected_source_revision_required");

  return async (): Promise<ReviewedTranslationRecord[]> => {
    const parsed = parseReviewedTranslationProviderJson(await input.readSource());
    if ("reason" in parsed) {
      throw new Error(`${parsed.reason}${parsed.detail ? `:${parsed.detail}` : ""}`);
    }
    for (const record of parsed.records) {
      if (record.provenance.sourceRevision !== expectedSourceRevision) {
        throw new Error("provider_source_revision_mismatch");
      }
      if (expectedSourceName && record.provenance.sourceName !== expectedSourceName) {
        throw new Error("provider_source_name_mismatch");
      }
    }
    return parsed.records;
  };
}

export function createEnvReviewedTranslationProvider(envKey = "FOR_AI_REVIEWED_TRANSLATIONS_JSON") {
  return async (): Promise<ReviewedTranslationRecord[]> => {
    const parsed = parseReviewedTranslationProviderJson(process.env[envKey]);
    if ("reason" in parsed) {
      throw new Error(`${parsed.reason}${parsed.detail ? `:${parsed.detail}` : ""}`);
    }
    return parsed.records;
  };
}
