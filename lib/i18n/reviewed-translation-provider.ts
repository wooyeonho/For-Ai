import { buildReviewedTranslationRecord, type ReviewedTranslationRecord } from "./reviewed-translation-record";
import { getTranslationProvenanceKey, type TranslationProvenance } from "./translation-provenance";

export type ReviewedTranslationProviderResult =
  | { ok: true; records: ReviewedTranslationRecord[] }
  | { ok: false; reason: "provider_empty" | "provider_invalid_json" | "provider_not_array" | "provider_record_invalid" | "provider_record_conflict"; detail?: string };

export type ReviewedTranslationHistoryEntry = {
  record: ReviewedTranslationRecord;
  status: "active" | "superseded";
  supersededByProvenanceKey?: string;
};

export function validateReviewedTranslationHistory(entries: ReviewedTranslationHistoryEntry[]):
  | { ok: true; activeRecords: ReviewedTranslationRecord[] }
  | { ok: false; reason: "history_missing_active" | "history_multiple_active" | "history_invalid_supersession"; detail: string } {
  const byPair = new Map<string, ReviewedTranslationHistoryEntry[]>();
  for (const entry of entries) {
    const pair = `${entry.record.provenance.locale}:${entry.record.messageKey}`;
    const bucket = byPair.get(pair) ?? [];
    bucket.push(entry);
    byPair.set(pair, bucket);
  }

  const activeRecords: ReviewedTranslationRecord[] = [];
  for (const [pair, bucket] of byPair) {
    const active = bucket.filter((entry) => entry.status === "active");
    if (active.length === 0) return { ok: false, reason: "history_missing_active", detail: pair };
    if (active.length > 1) return { ok: false, reason: "history_multiple_active", detail: pair };

    const activeKey = active[0].record.provenanceKey;
    for (const entry of bucket) {
      if (entry.status !== "superseded") continue;
      if (!entry.supersededByProvenanceKey || entry.supersededByProvenanceKey === entry.record.provenanceKey || entry.supersededByProvenanceKey !== activeKey) {
        return { ok: false, reason: "history_invalid_supersession", detail: pair };
      }
    }
    activeRecords.push(active[0].record);
  }
  return { ok: true, activeRecords };
}

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
  const canonicalPairs = new Map<string, string>();
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

    const pairKey = `${built.value.provenance.locale}:${built.value.messageKey}`;
    const pairIdentity = `${built.value.translatedText}\u0000${getTranslationProvenanceKey(built.value.provenance)}`;
    const previousIdentity = canonicalPairs.get(pairKey);
    if (previousIdentity && previousIdentity !== pairIdentity) {
      return { ok: false, reason: "provider_record_conflict", detail: pairKey };
    }
    canonicalPairs.set(pairKey, pairIdentity);
    records.push(built.value);
  }

  return { ok: true, records };
}

export function createReviewedTranslationSourceProvider(input: {
  readSource: () => Promise<string | undefined>;
  expectedSourceRevision: string;
  expectedSourceLocale?: TranslationProvenance["sourceLocale"];
  expectedProvenanceKey?: string;
}) {
  const expectedSourceRevision = input.expectedSourceRevision.trim();
  if (!expectedSourceRevision) throw new Error("expected_source_revision_required");
  const expectedProvenanceKey = input.expectedProvenanceKey?.trim();

  return async (): Promise<ReviewedTranslationRecord[]> => {
    const parsed = parseReviewedTranslationProviderJson(await input.readSource());
    if ("reason" in parsed) {
      throw new Error(`${parsed.reason}${parsed.detail ? `:${parsed.detail}` : ""}`);
    }
    for (const record of parsed.records) {
      if (record.provenance.sourceRevision !== expectedSourceRevision) {
        throw new Error("provider_source_revision_mismatch");
      }
      if (input.expectedSourceLocale && record.provenance.sourceLocale !== input.expectedSourceLocale) {
        throw new Error("provider_source_locale_mismatch");
      }
      if (expectedProvenanceKey && getTranslationProvenanceKey(record.provenance) !== expectedProvenanceKey) {
        throw new Error("provider_provenance_key_mismatch");
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
