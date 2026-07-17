// Pure classification/prioritization logic for Task 5-E (Bible v7 Book V §20).
// Kept dependency-free and side-effect-free so it can be unit tested without a
// database or network connection. scripts/jobs/check-evidence-freshness.mjs
// is the only caller that performs I/O.

export const TEMPORARY_FAILURE_THRESHOLD = 3;

const TEMPORARY_RESULTS = new Set(["temporarily_unavailable", "blocked", "fetch_error"]);
const DEFINITIVE_RESULTS = new Set(["healthy", "redirected", "content_changed", "evidence_missing", "not_found"]);

export function isTemporaryResult(result) {
  return TEMPORARY_RESULTS.has(result);
}

export function isDefinitiveResult(result) {
  return DEFINITIVE_RESULTS.has(result);
}

// Maps a SafeFetchError-shaped failure ({ code, details }) to the Task 5-E
// result taxonomy. 403/429 must not read as not_found (Bible Book V §20).
export function classifyFetchFailure(error) {
  const code = error?.code;
  const status = error?.details?.status;

  if (code === "http_status") {
    if (status === 404) return { result: "not_found", isTemporary: false, httpStatus: status };
    if (status === 403 || status === 429) return { result: "temporarily_unavailable", isTemporary: true, httpStatus: status };
    return { result: "temporarily_unavailable", isTemporary: true, httpStatus: status ?? null };
  }
  if (code === "blocked_address") return { result: "blocked", isTemporary: true, httpStatus: null };
  if (code === "timeout" || code === "network_error") return { result: "temporarily_unavailable", isTemporary: true, httpStatus: null };
  return { result: "fetch_error", isTemporary: true, httpStatus: null };
}

// Classifies a successful fetch whose quote lookup also succeeded (i.e. the
// evidence quote is still present). Quote-disappearance is handled by the
// caller before this is reached (it maps straight to evidence_missing).
export function classifyFetchSuccess({ finalUrl, canonicalUrl, contentHash, previousContentHash }) {
  if (finalUrl !== canonicalUrl) return { result: "redirected", isTemporary: false, httpStatus: 200 };
  if (previousContentHash && contentHash !== previousContentHash) return { result: "content_changed", isTemporary: false, httpStatus: 200 };
  return { result: "healthy", isTemporary: false, httpStatus: 200 };
}

// Whether a definitive negative result or an accumulated run of temporary
// failures should open (or refresh) an operator recheck card.
export function shouldOpenCard(result, consecutiveFailureCount, threshold = TEMPORARY_FAILURE_THRESHOLD) {
  if (result === "evidence_missing" || result === "not_found") return true;
  if (isTemporaryResult(result)) return consecutiveFailureCount >= threshold;
  return false;
}

// "Other valid sources prevent whole claim downgrade" (Bible Book V §20) is
// implemented as a severity signal only — this function never suppresses a
// card, it only tells the operator how urgent it is.
export function cardSeverity(result, otherValidEvidenceCount) {
  if (result === "evidence_missing" || result === "not_found") {
    return otherValidEvidenceCount > 0 ? "medium" : "high";
  }
  if (result === "content_changed") return "low";
  return "medium"; // accumulated temporary-failure card
}

// Sort comparator for the recheck queue: rows whose valid_until deadline has
// passed are checked first (oldest overdue first), then rows are ordered by
// staleness of their last successful check (nulls — never checked — first).
export function compareQueuePriority(a, b, now = new Date()) {
  const nowMs = now.getTime();
  const aOverdue = a.valid_until ? Date.parse(a.valid_until) < nowMs : false;
  const bOverdue = b.valid_until ? Date.parse(b.valid_until) < nowMs : false;
  if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
  if (aOverdue && bOverdue) {
    return Date.parse(a.valid_until) - Date.parse(b.valid_until);
  }
  const aChecked = a.last_checked_at ? Date.parse(a.last_checked_at) : -Infinity;
  const bChecked = b.last_checked_at ? Date.parse(b.last_checked_at) : -Infinity;
  return aChecked - bChecked;
}
