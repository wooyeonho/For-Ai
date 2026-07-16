import test from "node:test";
import assert from "node:assert/strict";
import { verifyQuoteInCanonicalText } from "../lib/quote-verification";

test("verifyQuoteInCanonicalText finds an exact unique match", () => {
  const text = "The city council approved the new budget on Tuesday.";
  const result = verifyQuoteInCanonicalText(text, "approved the new budget");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(text.slice(result.start, result.end), "approved the new budget");
    assert.match(result.hash, /^[0-9a-f]{64}$/);
  }
});

test("verifyQuoteInCanonicalText matches with controlled whitespace normalization", () => {
  const text = "The council   approved\nthe new budget.";
  const result = verifyQuoteInCanonicalText(text, "approved the new budget");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(text.slice(result.start, result.end), "approved\nthe new budget");
  }
});

test("verifyQuoteInCanonicalText rejects an absent quote", () => {
  const result = verifyQuoteInCanonicalText("Nothing relevant here.", "approved the new budget");
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "absent");
    assert.equal(result.occurrences, 0);
  }
});

test("verifyQuoteInCanonicalText rejects a quote occurring more than once", () => {
  const text = "It rained on Monday. It rained on Tuesday too.";
  const result = verifyQuoteInCanonicalText(text, "It rained on");
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "multiple");
    assert.equal(result.occurrences, 2);
  }
});

test("verifyQuoteInCanonicalText rejects an empty quote", () => {
  const result = verifyQuoteInCanonicalText("Some text here.", "   ");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "empty");
});

test("verifyQuoteInCanonicalText offsets round-trip through the original text", () => {
  const text = "Header line.\n\nA specific claim-supporting sentence.\n\nFooter line.";
  const quote = "specific claim-supporting sentence";
  const result = verifyQuoteInCanonicalText(text, quote);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(text.slice(result.start, result.end), quote);
  }
});
