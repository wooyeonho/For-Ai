import test from "node:test";
import assert from "node:assert/strict";
import {
  TEMPORARY_FAILURE_THRESHOLD,
  cardSeverity,
  classifyFetchFailure,
  classifyFetchSuccess,
  compareQueuePriority,
  shouldOpenCard,
} from "../scripts/lib/evidence-freshness.mjs";

test("404 classifies as not_found, but 403/429 do not (Bible Book V §20)", () => {
  assert.equal(classifyFetchFailure({ code: "http_status", details: { status: 404 } }).result, "not_found");
  assert.equal(classifyFetchFailure({ code: "http_status", details: { status: 403 } }).result, "temporarily_unavailable");
  assert.equal(classifyFetchFailure({ code: "http_status", details: { status: 429 } }).result, "temporarily_unavailable");
});

test("not_found is not temporary; 403/429/network failures are", () => {
  assert.equal(classifyFetchFailure({ code: "http_status", details: { status: 404 } }).isTemporary, false);
  assert.equal(classifyFetchFailure({ code: "http_status", details: { status: 429 } }).isTemporary, true);
  assert.equal(classifyFetchFailure({ code: "timeout", details: {} }).isTemporary, true);
  assert.equal(classifyFetchFailure({ code: "network_error", details: {} }).isTemporary, true);
});

test("blocked_address and unclassified errors map to blocked/fetch_error, both temporary", () => {
  assert.deepEqual(classifyFetchFailure({ code: "blocked_address", details: {} }), { result: "blocked", isTemporary: true, httpStatus: null });
  const other = classifyFetchFailure({ code: "empty_canonical_text", details: {} });
  assert.equal(other.result, "fetch_error");
  assert.equal(other.isTemporary, true);
});

test("successful fetch with unchanged final URL and hash is healthy", () => {
  const outcome = classifyFetchSuccess({
    finalUrl: "https://example.com/a",
    canonicalUrl: "https://example.com/a",
    contentHash: "abc",
    previousContentHash: "abc",
  });
  assert.equal(outcome.result, "healthy");
  assert.equal(outcome.isTemporary, false);
});

test("a persisted redirect is reported before a content-hash change", () => {
  const outcome = classifyFetchSuccess({
    finalUrl: "https://example.com/b",
    canonicalUrl: "https://example.com/a",
    contentHash: "def",
    previousContentHash: "abc",
  });
  assert.equal(outcome.result, "redirected");
});

test("same URL with a different content hash is content_changed", () => {
  const outcome = classifyFetchSuccess({
    finalUrl: "https://example.com/a",
    canonicalUrl: "https://example.com/a",
    contentHash: "def",
    previousContentHash: "abc",
  });
  assert.equal(outcome.result, "content_changed");
});

test("evidence_missing and not_found always open a card immediately", () => {
  assert.equal(shouldOpenCard("evidence_missing", 0), true);
  assert.equal(shouldOpenCard("not_found", 0), true);
});

test("temporary results need 3 consecutive failures before opening a card", () => {
  assert.equal(TEMPORARY_FAILURE_THRESHOLD, 3);
  assert.equal(shouldOpenCard("temporarily_unavailable", 1), false);
  assert.equal(shouldOpenCard("temporarily_unavailable", 2), false);
  assert.equal(shouldOpenCard("temporarily_unavailable", 3), true);
  assert.equal(shouldOpenCard("blocked", 3), true);
  assert.equal(shouldOpenCard("fetch_error", 3), true);
});

test("healthy/redirected/content_changed never open a card on their own", () => {
  assert.equal(shouldOpenCard("healthy", 0), false);
  assert.equal(shouldOpenCard("redirected", 0), false);
  assert.equal(shouldOpenCard("content_changed", 0), false);
});

test("card severity downgrades from high to medium when other evidence still supports the claim, never suppresses it", () => {
  assert.equal(cardSeverity("not_found", 0), "high");
  assert.equal(cardSeverity("not_found", 2), "medium");
  assert.equal(cardSeverity("evidence_missing", 0), "high");
  assert.equal(cardSeverity("evidence_missing", 1), "medium");
  assert.equal(cardSeverity("content_changed", 0), "low");
  assert.equal(cardSeverity("temporarily_unavailable", 0), "medium");
});

test("overdue valid_until rows are prioritized ahead of rows ordered only by last_checked_at", () => {
  const now = new Date("2026-07-17T00:00:00Z");
  const overdue = { valid_until: "2026-07-01T00:00:00Z", last_checked_at: "2026-07-16T00:00:00Z" };
  const neverChecked = { valid_until: null, last_checked_at: null };
  const rows = [neverChecked, overdue];
  rows.sort((a, b) => compareQueuePriority(a, b, now));
  assert.equal(rows[0], overdue);
});

test("among non-overdue rows, never-checked (null last_checked_at) sorts before recently-checked", () => {
  const now = new Date("2026-07-17T00:00:00Z");
  const neverChecked = { valid_until: null, last_checked_at: null };
  const recentlyChecked = { valid_until: null, last_checked_at: "2026-07-16T00:00:00Z" };
  const rows = [recentlyChecked, neverChecked];
  rows.sort((a, b) => compareQueuePriority(a, b, now));
  assert.equal(rows[0], neverChecked);
});
