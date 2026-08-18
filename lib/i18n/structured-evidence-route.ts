import {
  buildReviewedTranslationHistoryIndex,
  buildReviewedTranslationIndex,
} from "./reviewed-translation-index";
import { buildReviewedTranslationRecord, type ReviewedTranslationRecord } from "./reviewed-translation-record";
import { buildStructuredEvidenceResponse, type StructuredEvidenceResponse } from "./structured-evidence-response";

export type ReviewedRecordProvider = () => Promise<ReviewedTranslationRecord[]>;
export type ReviewedHistoryProvider = () => Promise<string | undefined>;

type StructuredEvidenceBody = Extract<StructuredEvidenceResponse, { status: 200 }>["body"];

type CorrectionDisclosure = {
  count: number;
  scope: "provenance_keys_only";
  supersededContentIncluded: false;
  message: "Correction history exposes provenance-only predecessor keys; superseded content is not included.";
};

export type StructuredEvidenceRouteResponse =
  | {
      status: 200;
      body: StructuredEvidenceBody & {
        predecessorProvenanceKeys?: string[];
        correctionCount?: number;
        correctionDisclosure?: CorrectionDisclosure;
      };
    }
  | { status: 404; body: { error: "reviewed_translation_not_found" } }
  | { status: 409; body: { error: "reviewed_translation_index_invalid"; reason: string } }
  | { status: 503; body: { error: "reviewed_translation_provider_unavailable" } };

function projectPredecessorProvenanceKeys(raw: string, activeProvenanceKey: string):
  | { ok: true; keys: string[] }
  | { ok: false; reason: "cyclic_correction_lineage" } {
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
    if (!built.ok) continue;
    if (built.value.provenanceKey === candidate.supersededByProvenanceKey) {
      return { ok: false, reason: "cyclic_correction_lineage" };
    }
    const list = reverse.get(candidate.supersededByProvenanceKey) ?? [];
    list.push(built.value.provenanceKey);
    reverse.set(candidate.supersededByProvenanceKey, list);
  }

  const keys: string[] = [];
  const seen = new Set<string>();
  const visiting = new Set<string>();

  function visit(current: string): boolean {
    if (visiting.has(current)) return false;
    if (seen.has(current)) return true;
    visiting.add(current);
    for (const predecessor of (reverse.get(current) ?? []).sort()) {
      if (!visit(predecessor)) return false;
      if (predecessor !== activeProvenanceKey && !keys.includes(predecessor)) keys.push(predecessor);
    }
    visiting.delete(current);
    seen.add(current);
    return true;
  }

  if (!visit(activeProvenanceKey)) return { ok: false, reason: "cyclic_correction_lineage" };
  return { ok: true, keys: keys.slice(0, 100) };
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
    const lineage = projectPredecessorProvenanceKeys(raw, response.body.provenanceKey);
    if (!lineage.ok) {
      return { status: 409, body: { error: "reviewed_translation_index_invalid", reason: lineage.reason } };
    }
    return {
      status: 200,
      body: {
        ...response.body,
        predecessorProvenanceKeys: lineage.keys,
        correctionCount: lineage.keys.length,
        correctionDisclosure: {
          count: lineage.keys.length,
          scope: "provenance_keys_only",
          supersededContentIncluded: false,
          message: "Correction history exposes provenance-only predecessor keys; superseded content is not included.",
        },
      },
    };
  };
}
