import assert from "node:assert/strict";
import test from "node:test";
import { resetCandidateIndexForTests, searchCandidates } from "../lib/check/candidates";
import { evaluateSentence, evaluateSentences, CheckTimeoutError } from "../lib/check/evaluate";
import type { CheckCandidate } from "../lib/check/types";

function candidate(overrides: Partial<CheckCandidate> & Pick<CheckCandidate, "claim_id" | "claim_text">): CheckCandidate {
  return {
    document_slug: "test-doc",
    claim_value: "",
    field_path: "value",
    status: "verified",
    confidence: "high",
    ...overrides,
  };
}

test.afterEach(() => {
  resetCandidateIndexForTests(null);
});

test("evaluateSentence returns no_candidates when the index is empty", () => {
  resetCandidateIndexForTests([]);
  const result = evaluateSentence("The Seoul Metro base fare is 1400 won.", "en");
  assert.equal(result.match, null);
  assert.equal(result.no_match_reason, "no_candidates");
});

test("evaluateSentence returns below_threshold when candidates exist but none are similar enough", () => {
  resetCandidateIndexForTests([candidate({ claim_id: "unrelated", claim_text: "Cherry blossoms bloom in April." })]);
  const result = evaluateSentence("The Seoul Metro base fare is 1400 won.", "en");
  assert.equal(result.match, null);
  assert.equal(result.no_match_reason, "below_threshold");
});

test("all-candidate selection: a higher-ranked but gated candidate is skipped in favor of a lower-ranked eligible one", () => {
  resetCandidateIndexForTests([
    // Near-identical wording to the query except polarity — highest raw
    // similarity, but must be excluded by the contradiction gate.
    candidate({ claim_id: "gated-decrease", claim_text: "The base fare decreased to 1400 won this year." }),
    // Different enough wording to rank lower on raw similarity, but shares no
    // contradiction with the query — must become the final match.
    candidate({ claim_id: "correct-increase", claim_text: "Seoul Metro base fare rose to 1400 won this year for adults." }),
  ]);

  const result = evaluateSentence("The base fare increased to 1400 won this year.", "en");
  assert.ok(result.match, "expected a match to be found");
  assert.equal(result.match?.claim_id, "correct-increase");
});

test("evaluateSentences aggregates per-status counts into summary and preserves total", () => {
  resetCandidateIndexForTests([
    candidate({ claim_id: "v1", claim_text: "The Seoul Metro base fare is 1400 won for adults.", status: "verified" }),
    candidate({ claim_id: "nr1", claim_text: "The passport reissue fee is 53000 won at the district office.", status: "needs_review" }),
    candidate({ claim_id: "d1", claim_text: "The move-in report deadline is 14 days after moving.", status: "disputed" }),
  ]);

  const response = evaluateSentences(
    [
      "The Seoul Metro base fare is 1400 won for adults.",
      "The passport reissue fee is 53000 won at the district office.",
      "The move-in report deadline is 14 days after moving.",
      "Completely unrelated sentence about cherry blossoms in April.",
    ],
    "en",
  );

  assert.equal(response.summary.total, 4);
  assert.equal(response.summary.verified, 1);
  assert.equal(response.summary.needs_review, 1);
  assert.equal(response.summary.disputed, 1);
  assert.equal(response.summary.not_found, 1);
  assert.equal(
    response.summary.total,
    response.summary.verified + response.summary.needs_review + response.summary.disputed + response.summary.not_found,
  );
});

test("evaluateSentences throws CheckTimeoutError and stops (no partial results) once the signal is already aborted", () => {
  resetCandidateIndexForTests([candidate({ claim_id: "v1", claim_text: "The Seoul Metro base fare is 1400 won for adults." })]);
  const controller = new AbortController();
  controller.abort();
  assert.throws(
    () => evaluateSentences(["The Seoul Metro base fare is 1400 won for adults."], "en", controller.signal),
    CheckTimeoutError,
  );
});

// --- Fixed-registry end-to-end Recall@5 -----------------------------------

const RECALL_REGISTRY: CheckCandidate[] = [
  candidate({ claim_id: "metro-fare", document_slug: "seoul-metro-fare", claim_text: "Seoul Metro base fare for adults", claim_value: "1400 won" }),
  candidate({ claim_id: "bus-fare", document_slug: "seoul-bus-fare", claim_text: "Seoul city bus base fare for adults", claim_value: "1500 won" }),
  candidate({ claim_id: "passport-fee", document_slug: "passport-reissue-fee", claim_text: "Passport reissue fee at a district office", claim_value: "53000 won" }),
  candidate({ claim_id: "move-in-deadline", document_slug: "move-in-report", claim_text: "Move-in report filing deadline after relocation", claim_value: "14 days" }),
  candidate({ claim_id: "id-card-fee", document_slug: "resident-id-reissue", claim_text: "Resident registration card reissue fee", claim_value: "0 won", status: "needs_review", confidence: "medium" }),
  candidate({ claim_id: "car-tax-window", document_slug: "car-tax-payment", claim_text: "Annual car tax payment window", claim_value: "June and December" }),
  candidate({ claim_id: "visa-photo-rule", document_slug: "visa-photo-requirements", claim_text: "Visa application photo requirements", claim_value: "taken within 6 months" }),
  candidate({ claim_id: "metro-fare-historical", document_slug: "seoul-metro-fare", claim_text: "Historical Seoul Metro fare before the 1998 revision", claim_value: "500 won", status: "disputed", confidence: "low" }),
  candidate({ claim_id: "opening-hours", document_slug: "district-office-hours", claim_text: "District office opening hours on weekdays", claim_value: "09:00-18:00" }),
  candidate({ claim_id: "unrelated-weather", document_slug: "seoul-weather", claim_text: "Average April temperature in Seoul", claim_value: "13 degrees Celsius" }),
];

const RECALL_QUERIES: Array<{ query: string; expectedClaimId: string }> = [
  { query: "What is the Seoul Metro base fare for adults?", expectedClaimId: "metro-fare" },
  { query: "How much is the Seoul city bus base fare for adults?", expectedClaimId: "bus-fare" },
  { query: "What does it cost to reissue a passport at a district office?", expectedClaimId: "passport-fee" },
  { query: "What is the deadline to file a move-in report after relocation?", expectedClaimId: "move-in-deadline" },
  { query: "Is there a fee to reissue a resident registration card?", expectedClaimId: "id-card-fee" },
  { query: "When is the annual car tax payment window?", expectedClaimId: "car-tax-window" },
  { query: "What are the visa application photo requirements?", expectedClaimId: "visa-photo-rule" },
  { query: "What were district office opening hours on weekdays?", expectedClaimId: "opening-hours" },
];

test("fixed-registry Recall@5: the expected claim appears in the top-5 raw search candidates", () => {
  resetCandidateIndexForTests(RECALL_REGISTRY);
  let hits = 0;
  for (const { query, expectedClaimId } of RECALL_QUERIES) {
    const top5 = searchCandidates(query, "en", 5);
    if (top5.some((item) => item.candidate.claim_id === expectedClaimId)) hits += 1;
  }
  const recallAt5 = hits / RECALL_QUERIES.length;
  assert.ok(recallAt5 >= 0.75, `Recall@5 regressed below 0.75: ${recallAt5.toFixed(2)} (${hits}/${RECALL_QUERIES.length})`);
});

test("fixed-registry Recall@5: final selected match is correct (post-gate) for the same query set", () => {
  resetCandidateIndexForTests(RECALL_REGISTRY);
  let correct = 0;
  for (const { query, expectedClaimId } of RECALL_QUERIES) {
    const result = evaluateSentence(query, "en");
    if (result.match?.claim_id === expectedClaimId) correct += 1;
  }
  const finalPrecision = correct / RECALL_QUERIES.length;
  assert.ok(finalPrecision >= 0.6, `final match precision regressed below 0.6: ${finalPrecision.toFixed(2)} (${correct}/${RECALL_QUERIES.length})`);
});

test("fixed-registry: decoys with conflicting quantities never become the final match for a specific-number query", () => {
  resetCandidateIndexForTests(RECALL_REGISTRY);
  const result = evaluateSentence("The Seoul Metro base fare for adults is 1400 won.", "en");
  assert.equal(result.match?.claim_id, "metro-fare");
  assert.notEqual(result.match?.claim_id, "bus-fare");
  assert.notEqual(result.match?.claim_id, "metro-fare-historical");
});
