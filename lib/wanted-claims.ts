// Bible v7 Task 5-A: app-layer validation for the public "wanted claim"
// suggestion intake. All PII/secret filtering happens here, BEFORE the raw
// text ever reaches the database -- a rejected submission is never stored,
// not even in a moderation queue, so no PII/secret text is ever persisted.

export const WANTED_CLAIM_TEXT_MAX_LENGTH = 500;
export const WANTED_CLAIM_TEXT_MIN_LENGTH = 3;

const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE_PATTERN = /(?:\+?\d[\s.-]?){7,15}\d/;
const CREDIT_CARD_PATTERN = /\b(?:\d[ -]?){13,19}\b/;
// Common API/secret key shapes: sk-..., AKIA..., ghp_..., long base64/hex runs
// that look like tokens rather than natural-language claim text.
const SECRET_KEY_PATTERN = /\b(sk-[a-z0-9]{16,}|AKIA[0-9A-Z]{12,}|gh[pousr]_[a-z0-9]{16,}|[a-z0-9+/]{32,}={0,2})\b/i;

export interface PiiCheckResult {
  containsPii: boolean;
  reason?: "email" | "phone" | "credit_card" | "secret_key";
}

export function checkForPiiOrSecrets(rawText: string): PiiCheckResult {
  if (EMAIL_PATTERN.test(rawText)) return { containsPii: true, reason: "email" };
  if (SECRET_KEY_PATTERN.test(rawText)) return { containsPii: true, reason: "secret_key" };
  if (CREDIT_CARD_PATTERN.test(rawText)) return { containsPii: true, reason: "credit_card" };
  if (PHONE_PATTERN.test(rawText)) return { containsPii: true, reason: "phone" };
  return { containsPii: false };
}

// Deliberately narrow and deterministic: this only ever prevents automatic
// promotion (routes to the operator-only "observing" queue, see
// wanted_claim_maybe_promote in the Task 5-A migration). It never rejects a
// submission outright and never classifies truth -- it is not a moderation
// or fact-checking system, just a conservative circuit breaker for content
// that touches reputation- or crime-adjacent claims about identifiable people.
const REPUTATION_CRIME_RISK_KEYWORDS = [
  "accused of",
  "convicted",
  "arrested",
  "indicted",
  "pedophile",
  "rapist",
  "murderer",
  "fraudster",
  "criminal record",
  "sex offender",
  "is a scammer",
  "is a scam",
];

export function isReputationOrCrimeRisk(normalizedLowerText: string): boolean {
  return REPUTATION_CRIME_RISK_KEYWORDS.some((keyword) => normalizedLowerText.includes(keyword));
}

export interface WantedClaimValidationError {
  ok: false;
  error: "too_short" | "too_long" | "contains_pii";
  piiReason?: PiiCheckResult["reason"];
}

export interface WantedClaimValidationOk {
  ok: true;
  riskFlag: boolean;
}

export function validateWantedClaimText(rawText: string): WantedClaimValidationError | WantedClaimValidationOk {
  const trimmed = rawText.trim();
  if (trimmed.length < WANTED_CLAIM_TEXT_MIN_LENGTH) return { ok: false, error: "too_short" };
  if (trimmed.length > WANTED_CLAIM_TEXT_MAX_LENGTH) return { ok: false, error: "too_long" };

  const pii = checkForPiiOrSecrets(trimmed);
  if (pii.containsPii) return { ok: false, error: "contains_pii", piiReason: pii.reason };

  return { ok: true, riskFlag: isReputationOrCrimeRisk(trimmed.toLowerCase()) };
}
