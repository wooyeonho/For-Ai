// Task 5-B1 — re-finds an LLM-produced quote inside a source's canonical
// text and verifies it is an unambiguous, unique occurrence before any
// claim_evidence row may be created. Matching is exact-string first, falling
// back to a controlled-whitespace-normalized match (runs of whitespace
// collapsed identically on both sides) so trivial formatting differences
// between the fetched page and the quoted excerpt don't cause a false
// "absent" reject. An absent or multiply-occurring quote is always rejected
// -- never silently disambiguated.

import { createHash } from "node:crypto";

export interface QuoteMatch {
  ok: true;
  start: number;
  end: number;
  hash: string;
}

export interface QuoteVerificationFailure {
  ok: false;
  reason: "absent" | "multiple" | "empty";
  occurrences: number;
}

export type QuoteVerificationResult = QuoteMatch | QuoteVerificationFailure;

function findAllOccurrences(haystack: string, needle: string): Array<[number, number]> {
  if (needle.length === 0) return [];
  const hits: Array<[number, number]> = [];
  let from = 0;
  while (true) {
    const idx = haystack.indexOf(needle, from);
    if (idx === -1) break;
    hits.push([idx, idx + needle.length]);
    from = idx + 1;
  }
  return hits;
}

function buildWhitespaceNormalizedMap(text: string): { normalized: string; toOriginal: number[] } {
  const toOriginal: number[] = [];
  let normalized = "";
  let inWhitespace = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      if (!inWhitespace) {
        normalized += " ";
        toOriginal.push(i);
        inWhitespace = true;
      }
    } else {
      normalized += ch;
      toOriginal.push(i);
      inWhitespace = false;
    }
  }
  return { normalized, toOriginal };
}

function findAllOccurrencesNormalized(haystack: string, needle: string): Array<[number, number]> {
  const normalizedNeedle = needle.replace(/\s+/g, " ").trim();
  if (!normalizedNeedle) return [];
  const { normalized, toOriginal } = buildWhitespaceNormalizedMap(haystack);
  const hits: Array<[number, number]> = [];
  let from = 0;
  while (true) {
    const idx = normalized.indexOf(normalizedNeedle, from);
    if (idx === -1) break;
    const startOrig = toOriginal[idx];
    const endNormIdx = idx + normalizedNeedle.length - 1;
    const endOrig = toOriginal[endNormIdx] + 1;
    hits.push([startOrig, endOrig]);
    from = idx + 1;
  }
  return hits;
}

export function verifyQuoteInCanonicalText(canonicalText: string, quote: string): QuoteVerificationResult {
  const trimmedQuote = quote.trim();
  if (!trimmedQuote) return { ok: false, reason: "empty", occurrences: 0 };

  let occurrences = findAllOccurrences(canonicalText, trimmedQuote);
  if (occurrences.length === 0) {
    occurrences = findAllOccurrencesNormalized(canonicalText, trimmedQuote);
  }

  if (occurrences.length === 0) return { ok: false, reason: "absent", occurrences: 0 };
  if (occurrences.length > 1) return { ok: false, reason: "multiple", occurrences: occurrences.length };

  const [start, end] = occurrences[0];
  const exactSlice = canonicalText.slice(start, end);
  return { ok: true, start, end, hash: createHash("sha256").update(exactSlice, "utf-8").digest("hex") };
}
