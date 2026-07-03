import assert from "node:assert/strict";
import test from "node:test";
import { assessClaimAlignment } from "../lib/i18n/claim-alignment";

const sourceClaim = {
  id: "claim-source-1",
  claim_text: "The adult base fare is KRW 1,400.",
  claim_value: "KRW 1,400",
  field_path: "fare.base_adult",
  jurisdiction: "KR",
  country: "KR",
  lang: "en",
  risk_tier: "low" as const,
};

const translatedClaim = {
  claim_text: "성인 기본 요금은 1,400원입니다.",
  claim_value: "KRW 1,400",
  field_path: "fare.base_adult",
  jurisdiction: "KR",
  country: "KR",
  lang: "ko",
};

test("high-similarity translations remain machine translated, not auto verified", () => {
  const result = assessClaimAlignment({ sourceClaim, translatedClaim }, { score: 0.95, model: "test-similarity" });

  assert.equal(result.recommendedTranslationStatus, "machine_translated");
  assert.equal(result.decision, "machine_translated_candidate");
  assert.equal(result.original_claim_id, sourceClaim.id);
});

test("metadata conflicts force human translation review", () => {
  const result = assessClaimAlignment(
    { sourceClaim, translatedClaim: { ...translatedClaim, claim_value: "KRW 1,500", country: "US" } },
    { score: 0.99, model: "test-similarity" },
  );

  assert.equal(result.recommendedTranslationStatus, "needs_human_translation_review");
  assert.equal(result.decision, "human_review_required");
  assert.deepEqual(result.conflicts, ["claim_value", "country"]);
});

test("high-risk translations cannot display verified before human review", () => {
  const result = assessClaimAlignment(
    { sourceClaim: { ...sourceClaim, risk_tier: "high" as const }, translatedClaim },
    { score: 0.98, model: "test-similarity" },
  );

  assert.equal(result.recommendedTranslationStatus, "needs_human_translation_review");
  assert.equal(result.verifiedDisplayAllowed, false);
  assert.match(result.reviewReasons.join(" "), /high-risk/);
});
