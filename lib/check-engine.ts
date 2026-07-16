import type { ClaimStatus, Confidence } from "./types";
import { getCitationPresentation } from "./citation-presentation";

export type NoMatchReason = "no_candidates" | "below_threshold" | "negation_mismatch" | "quantity_mismatch" | "polarity_mismatch";
export type CheckLocale = "ko" | "en" | "hi" | "ar" | "es" | "ja" | "zh";
export type CandidateClaim = { id: string; text: string; status: ClaimStatus; confidence: Confidence; sources: { title: string; url: string }[] };
export type CheckSentenceResult = { sentence: string; match: null | { claim: CandidateClaim; score: number; presentation: ReturnType<typeof getCitationPresentation> }; noMatchReason?: NoMatchReason };
export type CheckResult = { results: CheckSentenceResult[]; analyzed_sentence_count: number; truncated: boolean };

const MAX_SENTENCES = 50;
const CANDIDATES: CandidateClaim[] = [
  { id: "fixture-transport-001", text: "Airport rail fares require official operator confirmation before citation.", status: "unknown", confidence: "low", sources: [{ title: "Fixture source", url: "https://example.com/source" }] },
  { id: "fixture-commerce-001", text: "Refund windows must be verified from the merchant's official policy.", status: "needs_review", confidence: "low", sources: [{ title: "Fixture source", url: "https://example.com/policy" }] },
];

export function splitSentences(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const segments = normalized.match(/[^.!?。！？]+[.!?。！？]?/g) ?? [normalized];
  return segments.map((segment) => segment.trim()).filter(Boolean);
}

function tokenize(value: string): Set<string> {
  return new Set(value.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((token) => token.length > 2));
}

function similarity(a: string, b: string): number {
  const left = tokenize(a);
  const right = tokenize(b);
  if (!left.size || !right.size) return 0;
  const intersection = [...left].filter((token) => right.has(token)).length;
  return intersection / Math.max(left.size, right.size);
}

export function checkText(text: string): CheckResult {
  const sentences = splitSentences(text).slice(0, MAX_SENTENCES);
  const results = sentences.map((sentence): CheckSentenceResult => {
    const ranked = CANDIDATES.map((claim) => ({ claim, score: similarity(sentence, claim.text) })).sort((a, b) => b.score - a.score)[0];
    if (!ranked) return { sentence, match: null, noMatchReason: "no_candidates" };
    if (ranked.score < 0.28) return { sentence, match: null, noMatchReason: "below_threshold" };
    return { sentence, match: { claim: ranked.claim, score: Number(ranked.score.toFixed(3)), presentation: getCitationPresentation(ranked.claim.status, ranked.claim.confidence) } };
  });
  return { results, analyzed_sentence_count: results.length, truncated: splitSentences(text).length > MAX_SENTENCES };
}
