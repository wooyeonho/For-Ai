import assert from "node:assert/strict";
import test from "node:test";
import { evaluateRetrieval, findBestClaimMatch, gateCandidate, type ClaimCandidate } from "../lib/check-engine";
import calibration from "./fixtures/claim-similarity/calibration.json";
import regression from "./fixtures/claim-similarity/regression.json";
import holdout from "./fixtures/claim-similarity/holdout.json";

test("top lexical candidate can fail gate while second candidate passes", () => {
  const candidates: ClaimCandidate[] = [
    { id: "top-wrong-negated", entityId: "entity-a", text: "The city hall permit fee is not 30 dollars." },
    { id: "second-correct", entityId: "entity-a", text: "The city hall permit fee is 30 dollars." },
  ];
  const result = findBestClaimMatch("The city hall permit fee is 30 dollars.", candidates);
  assert.equal("claimId" in result && result.claimId, "second-correct");
});

test("hard negatives are separated by required gate category", () => {
  const cases = [
    ["negation", "The fare is 10 dollars.", "The fare is not 10 dollars.", "negation_mismatch"],
    ["number", "The fare is 10 dollars.", "The fare is 12 dollars.", "quantity_mismatch"],
    ["date", "The deadline is 2026-07-15.", "The deadline is 2026-08-15.", "date_mismatch"],
    ["increase/decrease", "The fee increased by 10 percent.", "The fee decreased by 10 percent.", "polarity_mismatch"],
    ["before/after", "Applications close before 2026-07-15.", "Applications close after 2026-07-15.", "temporal_mismatch"],
    ["same entity different conclusion", "Acme refund requests are approved.", "Acme refund requests are not approved.", "negation_mismatch"],
    ["subject/object reversal", "Alpha defeated Beta", "Beta defeated Alpha", "subject_object_reversal"],
  ] as const;

  for (const [label, input, text, reason] of cases) {
    const gate = gateCandidate(input, { id: label, entityId: "same-entity", text });
    assert.deepEqual(gate, { ok: false, reason }, label);
  }
});

test("v7 three-way fixture sets produce retrieval metrics", () => {
  for (const [name, fixtures] of Object.entries({ calibration, regression, holdout })) {
    const metrics = evaluateRetrieval(fixtures as Array<{ input: string; expectedId: string | null; candidates: ClaimCandidate[] }>);
    assert.equal(metrics.recallAt5, 1, `${name} Recall@5`);
    assert.equal(metrics.hardNegativeFalsePositiveRate, 0, `${name} hard-negative false positive`);
    assert.equal(metrics.notFoundFalseNegativeRate, 0, `${name} not-found false negative`);
  }
});
