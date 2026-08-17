import type { ReviewedTranslationRecord } from "./reviewed-translation-record";

export type ReviewedTranslationHistoryEntry = ReviewedTranslationRecord & {
  lifecycle: "active" | "superseded";
  supersedesProvenanceKey?: string;
};

export type ActiveTranslationSelection =
  | { ok: true; active: ReviewedTranslationRecord[] }
  | { ok: false; reason: "history_active_conflict" | "history_supersession_invalid"; detail: string };

export function selectActiveReviewedTranslations(
  entries: ReviewedTranslationHistoryEntry[],
): ActiveTranslationSelection {
  const byProvenance = new Map(entries.map((entry) => [entry.provenanceKey, entry]));
  const activeByPair = new Map<string, ReviewedTranslationRecord>();

  for (const entry of entries) {
    if (entry.supersedesProvenanceKey) {
      const previous = byProvenance.get(entry.supersedesProvenanceKey);
      if (!previous || previous.provenanceKey === entry.provenanceKey) {
        return {
          ok: false,
          reason: "history_supersession_invalid",
          detail: entry.provenanceKey,
        };
      }
      const previousPair = `${previous.provenance.locale}:${previous.messageKey}`;
      const currentPair = `${entry.provenance.locale}:${entry.messageKey}`;
      if (previousPair !== currentPair || previous.lifecycle !== "superseded") {
        return {
          ok: false,
          reason: "history_supersession_invalid",
          detail: currentPair,
        };
      }
    }

    if (entry.lifecycle !== "active") continue;
    const pair = `${entry.provenance.locale}:${entry.messageKey}`;
    if (activeByPair.has(pair)) {
      return { ok: false, reason: "history_active_conflict", detail: pair };
    }
    activeByPair.set(pair, entry);
  }

  return { ok: true, active: [...activeByPair.values()] };
}
