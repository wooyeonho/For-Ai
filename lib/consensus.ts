// lib/consensus.ts
// Cross-verification consensus algorithm for multi-AI candidate generation.
// Given candidates from multiple providers, finds agreement and scores reliability.
// Consensus output is a topic_candidates triage signal only: it must not write
// directly to claims, claim_sources, or verification_events, and it cannot
// promote anything to verified without human source review.
//
// Scoring is weighted, not a raw head count: each provider carries a trust
// `weight` (web-search-grounded > frontier > small parametric) and belongs to a
// `vendorGroup` whose total contribution is capped. This defends the "majority"
// signal against a single vendor's correlated errors (e.g. four NVIDIA models
// agreeing on the same hallucination). A candidate can only reach majority /
// unanimous if at least two distinct vendors agree, and the level is downgraded
// one step when no web-search-grounded provider is among the agreeing set.

import {
  cappedGroupWeight,
  providerVendorGroup,
  providerSupportsWebSearch,
} from "./ai-providers";

export interface CandidateEmbeddingInput {
  title: string;
  slug: string;
  category: string;
  claims?: { question?: string }[];
}

export interface CandidateEmbeddingRecord {
  embedding_model: string;
  embedding_text: string;
  embedding: number[];
}

export interface CandidateEmbeddingProvider {
  embedCandidate(input: CandidateEmbeddingInput): Promise<CandidateEmbeddingRecord>;
}

export function buildCandidateEmbeddingText(candidate: CandidateEmbeddingInput): string {
  const claimQuestions = (candidate.claims ?? [])
    .map((claim) => claim.question?.trim())
    .filter((question): question is string => Boolean(question));

  return [candidate.title, candidate.slug, candidate.category, ...claimQuestions]
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n");
}

interface CandidateSimilarityOptions {
  embeddingSimilarity?: number;
  embeddingThreshold?: number;
}

export interface CandidateSimilarityDecision {
  isSimilar: boolean;
  matchedBy: "slug" | "title" | "embedding" | "none";
  slugSimilarity: number;
  titleSimilarity: number;
  embeddingSimilarity?: number;
  reviewSignal: "merge_candidate" | "possible_duplicate" | "none";
}

export interface RawCandidate {
  title: string;
  slug: string;
  category: string;
  subcategory?: string;
  risk_tier?: string;
  why_people_ask_ai?: string;
  why_ai_gets_wrong?: string;
  claims?: { question: string; placeholder_value: string; required_source_type?: string }[];
  source_hints?: { url: string; title: string }[];
  source?: string;
  lang?: string;
  status?: string;
  generation_model?: string;
  [key: string]: unknown;
}

export interface ConsensusCandidate extends RawCandidate {
  consensus_score: number; // 0.0-1.0
  consensus_level: "unanimous" | "majority" | "minority" | "single";
  agreed_providers: string[];
  total_providers: number;
  merged_source_hints: { url: string; title: string }[];
  merged_claims: { question: string; placeholder_value: string; required_source_type?: string; provider_count: number }[];
}

function normalizeSlug(slug: string): string {
  return slug
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function slugSimilarity(a: string, b: string): number {
  const na = normalizeSlug(a);
  const nb = normalizeSlug(b);
  if (na === nb) return 1.0;

  const partsA = na.split("-");
  const partsB = nb.split("-");
  const common = partsA.filter((p) => partsB.includes(p));
  const total = new Set([...partsA, ...partsB]).size;
  return total > 0 ? common.length / total : 0;
}

function titleSimilarity(a: string, b: string): number {
  const wordsA = a.toLowerCase().split(/\s+/);
  const wordsB = b.toLowerCase().split(/\s+/);
  const common = wordsA.filter((w) => wordsB.includes(w));
  const total = new Set([...wordsA, ...wordsB]).size;
  return total > 0 ? common.length / total : 0;
}

export function getCandidateSimilarityDecision(
  a: RawCandidate,
  b: RawCandidate,
  options: CandidateSimilarityOptions = {}
): CandidateSimilarityDecision {
  const ss = normalizeSlug(a.slug) === normalizeSlug(b.slug) ? 1 : slugSimilarity(a.slug, b.slug);
  const ts = titleSimilarity(a.title, b.title);
  if (ss >= 0.6) {
    return { isSimilar: true, matchedBy: "slug", slugSimilarity: ss, titleSimilarity: ts, reviewSignal: "merge_candidate" };
  }
  if (ts >= 0.5) {
    return { isSimilar: true, matchedBy: "title", slugSimilarity: ss, titleSimilarity: ts, reviewSignal: "merge_candidate" };
  }

  const threshold = options.embeddingThreshold ?? 0.86;
  if (typeof options.embeddingSimilarity === "number" && options.embeddingSimilarity >= threshold) {
    return {
      isSimilar: false,
      matchedBy: "embedding",
      slugSimilarity: ss,
      titleSimilarity: ts,
      embeddingSimilarity: options.embeddingSimilarity,
      reviewSignal: "possible_duplicate",
    };
  }

  return {
    isSimilar: false,
    matchedBy: "none",
    slugSimilarity: ss,
    titleSimilarity: ts,
    embeddingSimilarity: options.embeddingSimilarity,
    reviewSignal: "none",
  };
}

function areSimilarCandidates(a: RawCandidate, b: RawCandidate, embeddingSimilarity?: number): boolean {
  const decision = getCandidateSimilarityDecision(a, b, { embeddingSimilarity });
  // Embedding-only matches intentionally do not merge consensus groups. They are
  // possible-duplicate review signals because semantic closeness can hide
  // materially different facts, languages, jurisdictions, or claim scopes.
  return decision.reviewSignal === "merge_candidate";
}

function mergeSourceHints(groups: RawCandidate[]): { url: string; title: string }[] {
  const seen = new Map<string, { url: string; title: string }>();
  for (const c of groups) {
    for (const hint of c.source_hints ?? []) {
      const key = hint.url.replace(/\/$/, "").toLowerCase();
      if (!seen.has(key)) {
        seen.set(key, hint);
      }
    }
  }
  return Array.from(seen.values());
}

function mergeClaims(
  groups: RawCandidate[]
): { question: string; placeholder_value: string; required_source_type?: string; provider_count: number }[] {
  const claimMap = new Map<string, { question: string; placeholder_value: string; required_source_type?: string; count: number }>();

  for (const c of groups) {
    for (const claim of c.claims ?? []) {
      const key = claim.question.toLowerCase().trim();
      const existing = claimMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        claimMap.set(key, {
          question: claim.question,
          // AI harness candidates carry unknown placeholders only; factual
          // values are filled later by human verification workflows.
          placeholder_value: "확인 필요",
          required_source_type: claim.required_source_type,
          count: 1,
        });
      }
    }
  }

  return Array.from(claimMap.values())
    .map((v) => ({ question: v.question, placeholder_value: v.placeholder_value, required_source_type: v.required_source_type, provider_count: v.count }))
    .sort((a, b) => b.provider_count - a.provider_count);
}

type ConsensusLevel = ConsensusCandidate["consensus_level"];

function downgradeLevel(level: ConsensusLevel): ConsensusLevel {
  // single/minority are already the floor for their situations.
  if (level === "unanimous") return "majority";
  if (level === "majority") return "minority";
  return level;
}

function computeConsensusLevel(
  agreedProviderCount: number,
  vendorGroupCount: number,
  weightedScore: number,
  hasWebSearch: boolean
): ConsensusLevel {
  let level: ConsensusLevel;
  if (agreedProviderCount <= 1) {
    level = "single";
  } else if (vendorGroupCount < 2) {
    // Multiple models but a single vendor — treat correlated agreement as weak.
    level = "minority";
  } else if (weightedScore >= 0.99) {
    level = "unanimous";
  } else if (weightedScore >= 0.5) {
    level = "majority";
  } else {
    level = "minority";
  }

  // Parametric-only agreement (no web-search grounding) is weaker evidence.
  return hasWebSearch ? level : downgradeLevel(level);
}

export function buildConsensus(
  candidatesByProvider: Map<string, Record<string, unknown>[]>,
  totalProviders: number
): ConsensusCandidate[] {
  // Weighted denominator: the full panel of providers that contributed
  // comparable output, with each vendor group capped.
  const panelProviders = [...candidatesByProvider.keys()];
  const panelWeight = cappedGroupWeight(panelProviders);
  const allCandidates: (RawCandidate & { _provider: string })[] = [];
  for (const [provider, candidates] of candidatesByProvider) {
    for (const c of candidates) {
      allCandidates.push({
        title: String(c.title ?? ""),
        slug: String(c.slug ?? ""),
        category: String(c.category ?? ""),
        ...c,
        _provider: provider,
      } as RawCandidate & { _provider: string });
    }
  }

  // Group similar candidates
  const groups: (RawCandidate & { _provider: string })[][] = [];
  const assigned = new Set<number>();

  for (let i = 0; i < allCandidates.length; i++) {
    if (assigned.has(i)) continue;
    const group = [allCandidates[i]];
    assigned.add(i);

    for (let j = i + 1; j < allCandidates.length; j++) {
      if (assigned.has(j)) continue;
      if (areSimilarCandidates(allCandidates[i], allCandidates[j])) {
        group.push(allCandidates[j]);
        assigned.add(j);
      }
    }
    groups.push(group);
  }

  // Build consensus candidates
  return groups
    .map((group) => {
      const providers = [...new Set(group.map((c) => c._provider))];
      const agreedWeight = cappedGroupWeight(providers);
      const score = panelWeight > 0 ? Math.min(1, agreedWeight / panelWeight) : 0;
      const vendorGroupCount = new Set(providers.map(providerVendorGroup)).size;
      const hasWebSearch = providers.some(providerSupportsWebSearch);
      const level = computeConsensusLevel(providers.length, vendorGroupCount, score, hasWebSearch);

      // Use the candidate from the most reliable source (prefer web-search provider)
      const primary =
        group.find((c) => c._provider === "perplexity") ?? group[0];

      const { _provider: _unused, ...rest } = primary;
      void _unused;
      return {
        ...rest,
        consensus_score: Math.round(score * 100) / 100,
        consensus_level: level,
        agreed_providers: providers,
        total_providers: totalProviders,
        merged_source_hints: mergeSourceHints(group),
        merged_claims: mergeClaims(group),
        source_hints: mergeSourceHints(group),
        claims: mergeClaims(group).map((c) => ({
          question: c.question,
          placeholder_value: c.placeholder_value,
          required_source_type: c.required_source_type,
        })),
      };
    })
    .sort((a, b) => b.consensus_score - a.consensus_score || b.merged_claims.length - a.merged_claims.length);
}
