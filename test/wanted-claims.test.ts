import test from "node:test";
import assert from "node:assert/strict";
import {
  checkForPiiOrSecrets,
  isReputationOrCrimeRisk,
  validateWantedClaimText,
  WANTED_CLAIM_TEXT_MAX_LENGTH,
} from "../lib/wanted-claims";

test("checkForPiiOrSecrets flags email addresses", () => {
  const result = checkForPiiOrSecrets("contact me at jane.doe@example.com about this");
  assert.equal(result.containsPii, true);
  assert.equal(result.reason, "email");
});

test("checkForPiiOrSecrets flags phone numbers", () => {
  const result = checkForPiiOrSecrets("call +1 415-555-0132 for details");
  assert.equal(result.containsPii, true);
  assert.equal(result.reason, "phone");
});

test("checkForPiiOrSecrets flags seven-digit local phone numbers", () => {
  const result = checkForPiiOrSecrets("call 555-0132 for details");
  assert.equal(result.containsPii, true);
  assert.equal(result.reason, "phone");
});

test("checkForPiiOrSecrets flags secret-key-shaped tokens", () => {
  const result = checkForPiiOrSecrets("my key is sk-abcdefghijklmnopqrstuvwx1234");
  assert.equal(result.containsPii, true);
  assert.equal(result.reason, "secret_key");
});

test("checkForPiiOrSecrets flags credit-card-shaped digit runs", () => {
  const result = checkForPiiOrSecrets("card number 4111 1111 1111 1111 was charged");
  assert.equal(result.containsPii, true);
  assert.equal(result.reason, "credit_card");
});

test("checkForPiiOrSecrets passes ordinary claim text", () => {
  const result = checkForPiiOrSecrets("what is the base fare for the metro in Seoul");
  assert.equal(result.containsPii, false);
  assert.equal(result.reason, undefined);
});

test("isReputationOrCrimeRisk matches known risk phrases in already-lowercased text", () => {
  assert.equal(isReputationOrCrimeRisk("john smith was arrested last year"), true);
  assert.equal(isReputationOrCrimeRisk("jane doe was convicted of fraud"), true);
  assert.equal(isReputationOrCrimeRisk("what is the refund window for this airline"), false);
});

test("validateWantedClaimText rejects text below the minimum length", () => {
  const result = validateWantedClaimText("ab");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "too_short");
});

test("validateWantedClaimText rejects text above the maximum length", () => {
  const result = validateWantedClaimText("a".repeat(WANTED_CLAIM_TEXT_MAX_LENGTH + 1));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "too_long");
});

test("validateWantedClaimText rejects PII without echoing it back as risk-flagged", () => {
  const result = validateWantedClaimText("reach me at test@example.com about the visa fee");
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error, "contains_pii");
    assert.equal(result.piiReason, "email");
  }
});

test("validateWantedClaimText accepts ordinary text with riskFlag=false", () => {
  const result = validateWantedClaimText("what is the daily fare cap for the Seoul subway");
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.riskFlag, false);
});

test("validateWantedClaimText accepts reputation-risk text but marks riskFlag=true", () => {
  const result = validateWantedClaimText("is it true that the mayor was indicted for fraud");
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.riskFlag, true);
});

test("validateWantedClaimText normalizes whitespace before reputation-risk matching", () => {
  const result = validateWantedClaimText("is there a criminal\n\nrecord for this person");
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.riskFlag, true);
});
