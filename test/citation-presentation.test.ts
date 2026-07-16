import assert from "node:assert/strict";
import test from "node:test";
import { presentationForKey, presentationForStatus, presentationForUnknown } from "../lib/citation-presentation";
import type { ClaimStatus } from "../lib/types";

const ALL_STATUSES: ClaimStatus[] = ["verified", "needs_review", "disputed", "unknown"];

test("presentationForStatus is exhaustive over every ClaimStatus value", () => {
  for (const status of ALL_STATUSES) {
    const presentation = presentationForStatus(status);
    assert.ok(presentation.machineLabel.length > 0);
    assert.ok(presentation.labelKey.length > 0);
    assert.ok(presentation.color.length > 0);
  }
});

test("presentationForUnknown recognizes valid status strings", () => {
  assert.equal(presentationForUnknown("verified").labelKey, "citationStatusVerified");
  assert.equal(presentationForUnknown("disputed").labelKey, "citationStatusDisputed");
});

test("presentationForUnknown falls back to 'unavailable' for unrecognized, null, or missing input", () => {
  assert.equal(presentationForUnknown("not-a-real-status").labelKey, "citationStatusUnavailable");
  assert.equal(presentationForUnknown(null).labelKey, "citationStatusUnavailable");
  assert.equal(presentationForUnknown(undefined).labelKey, "citationStatusUnavailable");
  assert.equal(presentationForUnknown("").labelKey, "citationStatusUnavailable");
});

test("presentationForKey supports the display-only 'unavailable' key alongside schema statuses", () => {
  assert.equal(presentationForKey("unavailable").labelKey, "citationStatusUnavailable");
  assert.equal(presentationForKey("verified").labelKey, "citationStatusVerified");
});
