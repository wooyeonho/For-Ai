import { getAllRegistryBundles } from "../data";
import type { SupportedLocale } from "../i18n/locales";
import { claimSimilarityTokenized, tokenizeForSimilarity, type TokenizedText } from "./similarity";
import type { CheckCandidate } from "./types";

export const MATCH_THRESHOLD = 0.3;

export type ScoredCandidate = { candidate: CheckCandidate; similarity: number };

type IndexedCandidate = CheckCandidate & { searchText: string; tokenized: TokenizedText };

let cachedIndex: IndexedCandidate[] | null = null;

// Tokenizing/bigramming happens once here, at index-build time, rather than
// once per (sentence, candidate) pair in searchCandidates — the registry is
// scanned for every sentence of every request, so re-deriving the same
// candidate's tokens on every scan was the largest avoidable cost on this
// endpoint's hot path.
function toIndexedCandidate(candidate: CheckCandidate, documentTitle = ""): IndexedCandidate {
  const searchText = `${candidate.claim_text} ${candidate.claim_value} ${candidate.field_path} ${documentTitle}`;
  return { ...candidate, searchText, tokenized: tokenizeForSimilarity(searchText) };
}

// Built once per process from the static in-memory registry (lib/data.ts) —
// no Supabase round-trip per request. The registry is compiled into the
// bundle at build time, so this index is stable for the process lifetime:
// a claim submitted or verified directly in Supabase after the last deploy
// is not searchable by Check until the next deploy rebuilds the bundle.
// This mirrors the existing pattern used by other citation surfaces (the
// document pages, /cite, and badge APIs all read this same static bundle
// rather than Supabase directly).
function buildIndex(): IndexedCandidate[] {
  if (cachedIndex) return cachedIndex;
  cachedIndex = getAllRegistryBundles().flatMap((bundle) =>
    bundle.claims.map((claim) =>
      toIndexedCandidate(
        {
          claim_id: claim.id,
          document_slug: bundle.document.slug,
          claim_text: claim.claim_text,
          claim_value: claim.claim_value,
          field_path: claim.field_path,
          status: claim.status,
          confidence: claim.confidence,
        },
        bundle.document.title,
      ),
    ),
  );
  return cachedIndex;
}

export function searchCandidates(sentence: string, locale: SupportedLocale, limit: number): ScoredCandidate[] {
  const index = buildIndex();
  const sentenceTokenized = tokenizeForSimilarity(sentence);
  const scored = index.map((candidate) => ({
    candidate,
    similarity: claimSimilarityTokenized(sentenceTokenized, candidate.tokenized, locale),
  }));
  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, limit).map(({ candidate, similarity }) => ({
    candidate: { claim_id: candidate.claim_id, document_slug: candidate.document_slug, claim_text: candidate.claim_text, claim_value: candidate.claim_value, field_path: candidate.field_path, status: candidate.status, confidence: candidate.confidence },
    similarity,
  }));
}

// Test-only: lets fixture-backed tests swap in a small, deterministic
// candidate pool instead of the full production registry.
export function resetCandidateIndexForTests(index: CheckCandidate[] | null): void {
  cachedIndex = index ? index.map((candidate) => toIndexedCandidate(candidate)) : null;
}
