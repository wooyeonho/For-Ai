import type { SupportedLocale } from "../i18n/locales";
import type { CitationStatus } from "../citation-presentation";
import type { Confidence } from "../types";

export type NoMatchReason =
  | "no_candidates"
  | "below_threshold"
  | "negation_mismatch"
  | "quantity_mismatch"
  | "polarity_mismatch";

export type ContradictionGate = "none" | "negation_mismatch" | "quantity_mismatch" | "polarity_mismatch";

export type QuantityUnit = "percent" | "year" | "date" | "currency" | "people" | "count" | "unknown";

export type Quantity = {
  normalizedValue: string;
  unit: QuantityUnit;
};

export type CheckCandidate = {
  claim_id: string;
  document_slug: string;
  claim_text: string;
  claim_value: string;
  field_path: string;
  status: CitationStatus;
  confidence: Confidence;
};

export type CheckMatch = {
  claim_id: string;
  document_slug: string;
  claim_text: string;
  status: CitationStatus;
  confidence: Confidence;
  similarity: number;
};

export type SentenceCheckResult = {
  sentence: string;
  match: CheckMatch | null;
  no_match_reason: NoMatchReason | null;
};

export type CheckSummary = {
  total: number;
  verified: number;
  needs_review: number;
  disputed: number;
  not_found: number;
};

export type CheckResponse = {
  sentences: SentenceCheckResult[];
  summary: CheckSummary;
};

export type CheckRequestBody = {
  text: string;
  locale?: SupportedLocale;
};

export const CHECK_LIMITS = {
  actualBodyBytes: 32_000,
  textMaxChars: 5_000,
  maxAnalyzableSentences: 50,
  candidatesPerSentence: 5,
  deadlineMs: 10_000,
} as const;
