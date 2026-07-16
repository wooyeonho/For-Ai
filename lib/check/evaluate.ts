import type { SupportedLocale } from "../i18n/locales";
import { MATCH_THRESHOLD, searchCandidates } from "./candidates";
import { detectContradictionReasons } from "./similarity";
import type { CheckResponse, CheckSummary, ContradictionGate, NoMatchReason, SentenceCheckResult } from "./types";
import { CHECK_LIMITS } from "./types";

// Bible v7 section 6.5: evaluate every top-ranked candidate (not just the single
// best lexical match) before deciding no-match, so a lower-ranked but
// contradiction-free candidate can still win over a higher-ranked one that
// fails the gate.
export function evaluateSentence(sentence: string, locale: SupportedLocale): SentenceCheckResult {
  const candidates = searchCandidates(sentence, locale, CHECK_LIMITS.candidatesPerSentence);
  if (candidates.length === 0) {
    return { sentence, match: null, no_match_reason: "no_candidates" };
  }

  const evaluated = candidates.map(({ candidate, similarity }, searchRank) => ({
    candidate,
    searchRank,
    similarity,
    gate: detectContradictionReasons(sentence, candidate.claim_text, locale),
  }));

  const eligible = evaluated
    .filter((item) => item.gate === "none" && item.similarity >= MATCH_THRESHOLD)
    .sort(
      (a, b) =>
        b.similarity - a.similarity ||
        a.searchRank - b.searchRank ||
        a.candidate.claim_id.localeCompare(b.candidate.claim_id),
    );

  const match = eligible[0] ?? null;

  if (match) {
    return {
      sentence,
      match: {
        claim_id: match.candidate.claim_id,
        document_slug: match.candidate.document_slug,
        claim_text: match.candidate.claim_text,
        status: match.candidate.status,
        confidence: match.candidate.confidence,
        similarity: match.similarity,
      },
      no_match_reason: null,
    };
  }

  // Prefer reporting a specific contradiction reason (in search-rank order)
  // over the generic below_threshold reason, since it's more actionable.
  const contradictionHit = evaluated.find(
    (item): item is typeof item & { gate: Exclude<ContradictionGate, "none"> } => item.gate !== "none",
  );
  const reason: NoMatchReason = contradictionHit ? contradictionHit.gate : "below_threshold";
  return { sentence, match: null, no_match_reason: reason };
}

function buildSummary(sentences: SentenceCheckResult[]): CheckSummary {
  const summary: CheckSummary = { total: sentences.length, verified: 0, needs_review: 0, disputed: 0, not_found: 0 };
  for (const result of sentences) {
    // not_found is strictly "no match was returned" — a matched claim always
    // lands in one of the other three buckets, even for the "unknown"
    // CitationStatus value (grouped with needs_review: both mean "matched,
    // but not confidently verified or disputed"). Bucketing an actual match
    // as not_found here would desync the UI (which renders the match) from
    // the summary/analytics counts (which wouldn't count it).
    if (!result.match) {
      summary.not_found += 1;
    } else if (result.match.status === "verified") {
      summary.verified += 1;
    } else if (result.match.status === "disputed") {
      summary.disputed += 1;
    } else {
      summary.needs_review += 1;
    }
  }
  return summary;
}

export class CheckTimeoutError extends Error {
  constructor() {
    super("check_timeout");
    this.name = "CheckTimeoutError";
  }
}

// The signal and the absolute deadline are checked between sentences. The
// absolute timestamp is required because candidate search/scoring is
// synchronous: while that work is running, an AbortSignal timer cannot fire
// until the event loop gets control back.
export function evaluateSentences(
  sentences: string[],
  locale: SupportedLocale,
  signal?: AbortSignal,
  deadlineAt?: number,
): CheckResponse {
  const results: SentenceCheckResult[] = [];
  for (const sentence of sentences) {
    if (signal?.aborted || (deadlineAt !== undefined && Date.now() >= deadlineAt)) {
      throw new CheckTimeoutError();
    }
    results.push(evaluateSentence(sentence, locale));
  }
  return { sentences: results, summary: buildSummary(results) };
}
