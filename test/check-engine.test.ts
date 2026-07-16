import assert from "node:assert/strict";
import test from "node:test";
import { checkText, splitSentences } from "../lib/check-engine";
import calibration from "./fixtures/claim-similarity/calibration.json";
import regression from "./fixtures/claim-similarity/regression.json";

test("splitSentences keeps static request text bounded by sentence", () => {
  assert.deepEqual(splitSentences("One. Two?"), ["One.", "Two?"]);
});

test("checkText matches fixture claims above threshold", () => {
  for (const row of calibration as { input: string; expected: string }[]) {
    const result = checkText(row.input);
    assert.equal(result.results[0]?.match?.claim.id, row.expected);
  }
});

test("checkText leaves unrelated claims unverified", () => {
  for (const row of regression as { input: string; expected: null }[]) {
    const result = checkText(row.input);
    assert.equal(result.results[0]?.match, row.expected);
    assert.equal(result.results[0]?.noMatchReason, "below_threshold");
  }
});
