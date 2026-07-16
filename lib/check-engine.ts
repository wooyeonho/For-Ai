export type NoMatchReason =
  | "no_candidates"
  | "below_threshold"
  | "negation_mismatch"
  | "quantity_mismatch"
  | "date_mismatch"
  | "polarity_mismatch"
  | "temporal_mismatch"
  | "subject_object_reversal";

export interface ClaimCandidate {
  id: string;
  text: string;
  entityId: string;
}

export interface CheckMatch {
  claimId: string;
  score: number;
  candidate: ClaimCandidate;
}

const NEGATION = /\b(no|not|never|without|isn't|aren't|doesn't|don't|cannot|can't|없다|아니다|않다|불가)\b/i;
const INCREASE = /\b(increase(?:d|s)?|rise(?:n|s)?|rose|higher|up|증가|상승)\b/i;
const DECREASE = /\b(decrease(?:d|s)?|fall(?:en|s)?|fell|lower|down|감소|하락)\b/i;
const BEFORE = /\b(before|prior to|earlier than|이전|전)\b/i;
const AFTER = /\b(after|later than|이후|후)\b/i;

function tokens(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

export function lexicalScore(a: string, b: string): number {
  const left = new Set(tokens(a));
  const right = new Set(tokens(b));
  if (left.size === 0 || right.size === 0) return 0;
  let overlap = 0;
  for (const token of left) if (right.has(token)) overlap += 1;
  return overlap / Math.max(left.size, right.size);
}

function numbers(text: string): string[] {
  return text.match(/\b\d+(?:\.\d+)?\b/g) ?? [];
}

function dates(text: string): string[] {
  return text.match(/\b\d{4}[-/.]\d{1,2}(?:[-/.]\d{1,2})?\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/gi) ?? [];
}

function hasSubjectObjectReversal(a: string, b: string): boolean {
  const pattern = /^\s*([\p{L}\p{N} ]+?)\s+(?:beat|defeated|acquired|bought|overruled)\s+([\p{L}\p{N} ]+?)\s*$/iu;
  const left = a.match(pattern);
  const right = b.match(pattern);
  return Boolean(left && right && left[1].trim().toLowerCase() === right[2].trim().toLowerCase() && left[2].trim().toLowerCase() === right[1].trim().toLowerCase());
}

export function gateCandidate(input: string, candidate: ClaimCandidate): { ok: true } | { ok: false; reason: NoMatchReason } {
  if (NEGATION.test(input) !== NEGATION.test(candidate.text)) return { ok: false, reason: "negation_mismatch" };
  const inputDates = dates(input).join("|").toLowerCase();
  const candidateDates = dates(candidate.text).join("|").toLowerCase();
  if (inputDates !== candidateDates) return { ok: false, reason: "date_mismatch" };
  const inputNumbers = numbers(input).join("|");
  const candidateNumbers = numbers(candidate.text).join("|");
  if (inputNumbers !== candidateNumbers) return { ok: false, reason: "quantity_mismatch" };
  if (INCREASE.test(input) !== INCREASE.test(candidate.text) || DECREASE.test(input) !== DECREASE.test(candidate.text)) return { ok: false, reason: "polarity_mismatch" };
  if (BEFORE.test(input) !== BEFORE.test(candidate.text) || AFTER.test(input) !== AFTER.test(candidate.text)) return { ok: false, reason: "temporal_mismatch" };
  if (hasSubjectObjectReversal(input, candidate.text)) return { ok: false, reason: "subject_object_reversal" };
  return { ok: true };
}

export function findBestClaimMatch(input: string, candidates: ClaimCandidate[], limit = 5): CheckMatch | { noMatchReason: NoMatchReason } {
  const ranked = candidates
    .map((candidate) => ({ candidate, score: lexicalScore(input, candidate.text) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  if (ranked.length === 0) return { noMatchReason: "no_candidates" };
  for (const entry of ranked) {
    if (entry.score < 0.2) continue;
    const gate = gateCandidate(input, entry.candidate);
    if (gate.ok) return { claimId: entry.candidate.id, score: entry.score, candidate: entry.candidate };
  }
  return { noMatchReason: "below_threshold" };
}

export function evaluateRetrieval(fixtures: Array<{ input: string; expectedId: string | null; candidates: ClaimCandidate[] }>) {
  let recallHits = 0;
  let recallTotal = 0;
  let hardNegativeFalsePositives = 0;
  let hardNegativeTotal = 0;
  let notFoundFalseNegatives = 0;
  let notFoundTotal = 0;
  for (const fixture of fixtures) {
    const result = findBestClaimMatch(fixture.input, fixture.candidates);
    if (fixture.expectedId) {
      recallTotal += 1;
      if ("claimId" in result && result.claimId === fixture.expectedId) recallHits += 1;
      else notFoundFalseNegatives += 1;
      notFoundTotal += 1;
    } else {
      hardNegativeTotal += 1;
      if ("claimId" in result) hardNegativeFalsePositives += 1;
    }
  }
  return { recallAt5: recallTotal ? recallHits / recallTotal : 0, hardNegativeFalsePositiveRate: hardNegativeTotal ? hardNegativeFalsePositives / hardNegativeTotal : 0, notFoundFalseNegativeRate: notFoundTotal ? notFoundFalseNegatives / notFoundTotal : 0 };
}
