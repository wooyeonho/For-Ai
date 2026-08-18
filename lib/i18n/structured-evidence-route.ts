import {
  buildReviewedTranslationHistoryIndex,
  buildReviewedTranslationIndex,
} from "./reviewed-translation-index";
import { buildReviewedTranslationRecord, type ReviewedTranslationRecord } from "./reviewed-translation-record";
import { buildStructuredEvidenceResponse, type StructuredEvidenceResponse } from "./structured-evidence-response";

export type ReviewedRecordProvider = () => Promise<ReviewedTranslationRecord[]>;
export type ReviewedHistoryProvider = () => Promise<string | undefined>;

type StructuredEvidenceBody = Extract<StructuredEvidenceResponse, { status: 200 }>["body"];

export type StructuredEvidenceRouteResponse =
  | { status: 200; body: StructuredEvidenceBody & { predecessorProvenanceKeys?: string[] } }
  | { status: 404; body: { error: "reviewed_translation_not_found" } }
  | { status: 409; body: { error: "reviewed_translation_index_invalid"; reason: string } }
  | { status: 503; body: { error: "reviewed_translation_provider_unavailable" } };

function projectPredecessorProvenanceKeys(raw: string, activeProvenanceKey: string): string[] {
  const parsed = JSON.parse(raw) as Array<Record<string, unknown>>;
  const reverse = new Map<string, string[]>();

  for (const candidate of parsed) {
    if (candidate.status !== "superseded" || typeof candidate.supersededByProvenanceKey !== "string") continue;
    const source = candidate.record && typeof candidate.record === "object" ? candidate.record as Record<string, unknown> : null;
    if (!source) continue;
    const built = buildReviewedTranslationRecord({
      messageKey: typeof source.messageKey === "string" ? source.messageKey : undefined,
      translatedText: typeof source.translatedText === "string" ? source.translatedText : undefined,
      provenance: source.provenance && typeof source.provenance === "object" ? source.provenance as Parameters<typeof buildReviewedTranslationRecord>[0]["provenance"] : undefined,
    });
    if (!built.ok || built.value.provenanceKey === candidate.supersededByProvenanceKey) continue;
    const list = reverse.get(candidate.supersededByProvenanceKey) ?? [];
    list.push(built.value.provenanceKey);
    reverse.set(candidate.supersededByProvenanceKey, list);
  }

  const keys: string[] = [];
  const seen = new Set<string>([activeProvenanceKey]);
  const queue = [activeProvenanceKey];
  while (queue.length) {
    const current = queue.shift()!;
    for (const predecessor of (reverse.get(current) ?? []).sort()) {
      if (seen.has(predecessor)) continue;
      seen.add(predecessor);
      keys.push(predecessor);
      queue.push(predecessor);
    }
  }
  return keys;
}

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

export function createStructuredEvidenceHistoryRoute(loadReviewedHistory: ReviewedHistoryProvider) {
  return async function handleStructuredEvidenceFromHistory(
    locale: string,
    messageKey: string,
  ): Promise<StructuredEvidenceRouteResponse> {
    let raw: string | undefined;
    try {
      raw = await loadReviewedHistory();
    } catch {
      return { status: 503, body: { error: "reviewed_translation_provider_unavailable" } };
    }

    const index = buildReviewedTranslationHistoryIndex(raw);
    if ("reason" in index) {
      return { status: 409, body: { error: "reviewed_translation_index_invalid", reason: index.reason } };
    }
    const response = buildStructuredEvidenceResponse(index.value, locale, messageKey);
    if (response.status !== 200 || !raw) return response;
    return {
      status: 200,
      body: {
        ...response.body,
        predecessorProvenanceKeys: projectPredecessorProvenanceKeys(raw, response.body.provenanceKey),
      },
    };
  };
}
