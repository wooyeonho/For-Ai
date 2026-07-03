import test from "node:test";
import assert from "node:assert/strict";
import {
  hasHoneypotValue,
  countUrls,
  hasRepeatedText,
  hasAdvertisingLanguage,
  inspectSubmissionText,
} from "../lib/submission-guard";

test("hasHoneypotValue flags any filled honeypot field", () => {
  assert.equal(hasHoneypotValue({ honeypot: "bot" }), true);
  assert.equal(hasHoneypotValue({ website: "  spam.com  " }), true);
  assert.equal(hasHoneypotValue({ content: "legit report" }), false);
  assert.equal(hasHoneypotValue({ honeypot: "" }), false);
});

test("countUrls counts links across all provided fields", () => {
  assert.equal(countUrls("see https://a.com and www.b.com", "no links here"), 2);
  assert.equal(countUrls(null, undefined, ""), 0);
});

test("hasRepeatedText catches spam padding but ignores short legitimate text", () => {
  assert.equal(hasRepeatedText("short"), false);
  assert.equal(hasRepeatedText("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"), true);
  assert.equal(hasRepeatedText("this is a normal, reasonably long sentence about a fee."), false);
});

test("hasAdvertisingLanguage matches known ad phrases case-insensitively", () => {
  assert.equal(hasAdvertisingLanguage("BUY NOW while supplies last"), true);
  assert.equal(hasAdvertisingLanguage("지금 구매하세요"), true);
  assert.equal(hasAdvertisingLanguage("the passport fee increased in March"), false);
});

test("inspectSubmissionText flags spam-suspected content without hard-rejecting it", () => {
  const spammy = inspectSubmissionText(["buy now https://a.com https://b.com https://c.com https://d.com"]);
  assert.equal(spammy.reject, false);
  assert.equal(spammy.status, "spam_suspected");
  assert.ok(spammy.reasons.includes("too_many_urls"));
  assert.ok(spammy.reasons.includes("advertising_language"));

  const clean = inspectSubmissionText(["the passport reissue fee changed last month"]);
  assert.equal(clean.status, "new");
  assert.deepEqual(clean.reasons, []);
});
