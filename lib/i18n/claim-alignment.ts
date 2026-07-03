import type { Claim, TranslationStatus } from "../types";

export type ClaimAlignmentTranslationStatus = Extract<TranslationStatus, "machine_translated" | "needs_human_translation_review">;

export type ClaimAlignmentDecision =
  | "machine_translated_candidate"
  | "human_review_required";

export type ClaimAlignmentConflictField = "claim_value" | "field_path" | "jurisdiction" | "country";

export type ClaimAlignmentSimilarityInput = {
  sourceClaim: Pick<Claim, "id" | "claim_text" | "claim_value" | "field_path" | "jurisdiction" | "country" | "lang" | "risk_tier">;
  translatedClaim: Pick<Claim, "claim_text" | "claim_value" | "field_path" | "jurisdiction" | "country" | "lang"> & Partial<Pick<Claim, "id" | "original_claim_id" | "translation_status">>;
};

export type ClaimAlignmentSimilarityResult = {
  score: number;
  model: string;
  reasons?: string[];
};

export type ClaimAlignmentAssessment = {
  original_claim_id: string;
  similarity: ClaimAlignmentSimilarityResult;
  conflicts: ClaimAlignmentConflictField[];
  highRiskHumanReviewRequired: boolean;
  recommendedTranslationStatus: ClaimAlignmentTranslationStatus;
  decision: ClaimAlignmentDecision;
  verifiedDisplayAllowed: boolean;
  reviewReasons: string[];
};

export type ClaimSimilarityProvider = {
  readonly model: string;
  compare(input: ClaimAlignmentSimilarityInput): Promise<ClaimAlignmentSimilarityResult>;
};

export const CLAIM_ALIGNMENT_HIGH_SIMILARITY_THRESHOLD = 0.86;

function normalizeComparable(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function conflictsFor(input: ClaimAlignmentSimilarityInput): ClaimAlignmentConflictField[] {
  const conflicts: ClaimAlignmentConflictField[] = [];
  for (const key of ["claim_value", "field_path", "jurisdiction", "country"] as const) {
    if (normalizeComparable(input.sourceClaim[key]) !== normalizeComparable(input.translatedClaim[key])) {
      conflicts.push(key);
    }
  }
  return conflicts;
}

export function assessClaimAlignment(
  input: ClaimAlignmentSimilarityInput,
  similarity: ClaimAlignmentSimilarityResult,
  highSimilarityThreshold = CLAIM_ALIGNMENT_HIGH_SIMILARITY_THRESHOLD,
): ClaimAlignmentAssessment {
  const conflicts = conflictsFor(input);
  const reviewReasons: string[] = [];
  const highRiskHumanReviewRequired = input.sourceClaim.risk_tier === "high";

  if (similarity.score < highSimilarityThreshold) reviewReasons.push("semantic similarity is below the machine-translation threshold");
  for (const conflict of conflicts) reviewReasons.push(`${conflict} conflicts with the source-language claim`);
  if (highRiskHumanReviewRequired) reviewReasons.push("high-risk translated claims cannot display as verified until human translation review");

  const requiresReview = reviewReasons.length > 0;

  return {
    original_claim_id: input.sourceClaim.id,
    similarity,
    conflicts,
    highRiskHumanReviewRequired,
    recommendedTranslationStatus: requiresReview ? "needs_human_translation_review" : "machine_translated",
    decision: requiresReview ? "human_review_required" : "machine_translated_candidate",
    verifiedDisplayAllowed: !highRiskHumanReviewRequired && !requiresReview,
    reviewReasons,
  };
}

export async function compareAndAssessClaimAlignment(
  input: ClaimAlignmentSimilarityInput,
  provider: ClaimSimilarityProvider,
  highSimilarityThreshold = CLAIM_ALIGNMENT_HIGH_SIMILARITY_THRESHOLD,
): Promise<ClaimAlignmentAssessment> {
  const similarity = await provider.compare(input);
  return assessClaimAlignment(input, { ...similarity, model: similarity.model || provider.model }, highSimilarityThreshold);
}
