import test from "node:test";
import assert from "node:assert/strict";
import {
  hasHoneypotValue,
  countUrls,
  hasRepeatedText,
  hasAdvertisingLanguage,
  inspectSubmissionText,
  contributorSubmissionRateLimited,
} from "../lib/submission-guard";
import {
  SUBMISSION_URL_MAX_COUNT,
  SUBMISSION_PER_MINUTE_LIMIT,
} from "../lib/submission-constants";

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

function urlList(count: number): string {
  return Array.from({ length: count }, (_, i) => `https://example.com/${i}`).join(" ");
}

test("inspectSubmissionText honors the SUBMISSION_URL_MAX_COUNT boundary from constants", () => {
  const atLimit = inspectSubmissionText([`a report with sources ${urlList(SUBMISSION_URL_MAX_COUNT)}`]);
  assert.ok(!atLimit.reasons.includes("too_many_urls"), "exactly the max URL count must not trip the check");

  const overLimit = inspectSubmissionText([`a report with sources ${urlList(SUBMISSION_URL_MAX_COUNT + 1)}`]);
  assert.ok(overLimit.reasons.includes("too_many_urls"), "one more than the max URL count must trip the check");
});

test("contributorSubmissionRateLimited enforces SUBMISSION_PER_MINUTE_LIMIT per contributor", async () => {
  const hash = `test-contributor-${Date.now()}-a`;
  for (let i = 0; i < SUBMISSION_PER_MINUTE_LIMIT; i++) {
    assert.equal(await contributorSubmissionRateLimited(hash), null, `call ${i + 1} should be within the per-minute limit`);
  }
  assert.equal(await contributorSubmissionRateLimited(hash), "minute");
});

test("contributorSubmissionRateLimited keys the per-minute limit independently per contributor", async () => {
  const exhausted = `test-contributor-${Date.now()}-b`;
  for (let i = 0; i < SUBMISSION_PER_MINUTE_LIMIT; i++) {
    await contributorSubmissionRateLimited(exhausted);
  }
  assert.equal(await contributorSubmissionRateLimited(exhausted), "minute");

  const fresh = `test-contributor-${Date.now()}-c`;
  assert.equal(await contributorSubmissionRateLimited(fresh), null);
});
