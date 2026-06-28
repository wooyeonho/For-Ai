import test from "node:test";
import assert from "node:assert/strict";
import {
  UNKNOWN_FACT_TEXT,
  ageInDays,
  getCanonicalDirectAnswer,
  getClaimCitationStatus,
  getDocumentCitationStatus,
  isStale,
  type ClaimCitationStatus,
} from "../lib/citation-status";
import type {
  ClaimWithSources,
  Document,
  Entity,
  Listing,
  RegistryDocumentBundle,
  VerificationEvent,
} from "../lib/types";

const NOW = new Date("2026-06-27T00:00:00.000Z");

function source(overrides: Partial<ClaimWithSources["sources"][number]> = {}): ClaimWithSources["sources"][number] {
  return {
    id: "src-1",
    claim_id: "claim-1",
    source_type: "official",
    title: "Official source",
    url: "https://example.gov/fact",
    citation: null,
    observed_at: "2026-06-20",
    contributor_hash: null,
    created_at: null,
    ...overrides,
  };
}

function verificationEvent(overrides: Partial<VerificationEvent> = {}): VerificationEvent {
  return {
    id: "ve-1",
    claim_id: "claim-1",
    event_type: "source_verified",
    previous_status: "needs_review",
    new_status: "verified",
    previous_confidence: "low",
    new_confidence: "high",
    note: "Verified against official source.",
    contributor_hash: null,
    created_at: "2026-06-20",
    ...overrides,
  };
}

function claim(overrides: Partial<ClaimWithSources> = {}): ClaimWithSources {
  return {
    id: "claim-1",
    document_id: "doc-1",
    entity_id: "entity-1",
    field_path: "fare.base_adult",
    claim_text: "What is the adult base fare?",
    claim_value: "1,400원",
    jurisdiction: "KR",
    confidence: "high",
    status: "verified",
    last_verified_at: "2026-06-20",
    created_at: null,
    updated_at: null,
    sources: [source()],
    verification_events: [verificationEvent()],
    ...overrides,
  };
}

function document(overrides: Partial<Document> = {}): Document {
  return {
    id: "doc-1",
    entity_id: "entity-1",
    slug: "seoul-metro-base-fare",
    lang: "ko",
    country: "KR",
    title: "서울 지하철 기본요금",
    category: "transport.metro",
    template: "fact-registry",
    status: "verified",
    confidence: "high",
    last_verified_at: "2026-06-20",
    license_code: "forai-data-license-v0.1",
    data: {},
    created_at: null,
    updated_at: null,
    ...overrides,
  };
}

function bundle(claims: ClaimWithSources[], overrides: Partial<RegistryDocumentBundle> = {}): RegistryDocumentBundle {
  const entity: Entity = {
    id: "entity-1",
    type: "transport.metro",
    canonical_name: "Seoul Metro Fare",
    country: "KR",
    region: null,
    city: null,
    created_at: null,
    updated_at: null,
  };
  const listing: Listing = {
    id: "listing-1",
    entity_id: "entity-1",
    document_id: "doc-1",
    lang: "ko",
    slug: "seoul-metro-base-fare",
    title: "서울 지하철 기본요금",
    summary: null,
    status: "verified",
    confidence: "high",
    created_at: null,
    updated_at: null,
  };
  return {
    entity,
    document: document(),
    claims,
    listing,
    ...overrides,
  };
}

function assertUnverified(status: ClaimCitationStatus) {
  assert.equal(status.isCitationReady, false);
  assert.equal(status.label, "unverified");
}

test("ageInDays returns whole days and null for missing or invalid dates", () => {
  assert.equal(ageInDays("2026-06-20", NOW), 7);
  assert.equal(ageInDays(null, NOW), null);
  assert.equal(ageInDays("not-a-date", NOW), null);
});

test("isStale treats missing dates as stale and only expires after ttl is exceeded", () => {
  assert.equal(isStale(null, 180, NOW), true);
  assert.equal(isStale("2025-12-29", 180, NOW), false);
  assert.equal(isStale("2025-12-28", 180, NOW), true);
});

test("getClaimCitationStatus marks fully sourced verified claims as citation-ready", () => {
  const status = getClaimCitationStatus(claim());
  assert.equal(status.isCitationReady, true);
  assert.equal(status.label, "verified");
});

test("getClaimCitationStatus rejects placeholders, low confidence, missing sources, and missing last_verified_at", () => {
  assertUnverified(getClaimCitationStatus(claim({ claim_value: UNKNOWN_FACT_TEXT })));
  assertUnverified(getClaimCitationStatus(claim({ confidence: "low" })));
  assertUnverified(getClaimCitationStatus(claim({ sources: [] })));
  assertUnverified(getClaimCitationStatus(claim({ last_verified_at: null })));
});

test("getClaimCitationStatus accepts a verified status as a verification signal", () => {
  const status = getClaimCitationStatus(claim({ verification_events: [] }));
  assert.equal(status.isCitationReady, true);
});

test("getDocumentCitationStatus requires human-approved documents and every claim to be ready", () => {
  const approved = getDocumentCitationStatus(bundle([claim()]), 180);
  assert.equal(approved.isVerifiedDocument, true);
  assert.equal(approved.verifiedClaims, 1);
  assert.equal(approved.unverifiedClaims, 0);

  const draft = getDocumentCitationStatus(bundle([claim()], { document: document({ status: "needs_review" }) }), 180);
  assert.equal(draft.isVerifiedDocument, false);
  assert.equal(draft.label, "unverified");

  const mixed = getDocumentCitationStatus(bundle([claim(), claim({ id: "claim-2", claim_value: UNKNOWN_FACT_TEXT })]), 180);
  assert.equal(mixed.isVerifiedDocument, false);
  assert.equal(mixed.verifiedClaims, 1);
  assert.equal(mixed.unverifiedClaims, 1);
});

test("getDocumentCitationStatus reports freshness from the oldest ready claim", () => {
  const fresh = getDocumentCitationStatus(bundle([claim({ last_verified_at: "2026-06-20" })]), 180);
  assert.equal(fresh.freshness, "fresh");
  assert.equal(fresh.oldestVerifiedAt, "2026-06-20");

  const stale = getDocumentCitationStatus(bundle([claim({ last_verified_at: "2025-12-28" })]), 180);
  assert.equal(stale.freshness, "stale");
  assert.equal(stale.oldestVerifiedAt, "2025-12-28");
});

test("getCanonicalDirectAnswer returns the first citation-ready value or the unknown placeholder", () => {
  assert.equal(getCanonicalDirectAnswer(bundle([claim({ claim_value: UNKNOWN_FACT_TEXT }), claim({ id: "claim-2", claim_value: "Ready value" })])), "Ready value");
  assert.equal(getCanonicalDirectAnswer(bundle([claim({ claim_value: UNKNOWN_FACT_TEXT })])), UNKNOWN_FACT_TEXT);
});
