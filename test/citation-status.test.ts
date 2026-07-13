import test from "node:test";
import assert from "node:assert/strict";
import {
  UNKNOWN_FACT_TEXT,
  ageInDays,
  getCanonicalDirectAnswer,
  getClaimCitationStatus,
  getClaimVerificationLevel,
  getVerifiedClaimViolations,
  getDocumentCitationStatus,
  getFreshnessWindowDays,
  getFreshnessPolicy,
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

// getDocumentCitationStatus computes freshness against the real system clock, so
// TTL-boundary assertions must use dates relative to *now* rather than fixed
// literals (a hardcoded date silently crosses the TTL boundary as time passes).
function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

function source(overrides: Partial<ClaimWithSources["sources"][number]> = {}): ClaimWithSources["sources"][number] {
  return {
    id: "src-1",
    claim_id: "claim-1",
    source_type: "official",
    source_authority: "official",
    title: "Official source",
    url: "https://example.gov/fact",
    citation: null,
    lang: "en",
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
    country: "KR",
    region: null,
    city: null,
    risk_tier: "low",
    update_frequency: "event_based",
    disclaimer_type: "check_official_source",
    lang: "en",
    original_claim_id: null,
    translation_status: null,
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
    region: null,
    city: null,
    jurisdiction: "KR",
    canonical_slug: "seoul-metro-base-fare",
    title: "서울 지하철 기본요금",
    localized_title: { ko: "서울 지하철 기본요금" },
    category: "transport.metro",
    template: "fact-registry",
    status: "verified",
    confidence: "high",
    risk_tier: "low",
    update_frequency: "event_based",
    disclaimer_type: "check_official_source",
    translation_status: "source_language",
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


test("getClaimVerificationLevel explains UI-only verification progress without changing citation readiness", () => {
  assert.equal(getClaimVerificationLevel(claim({ claim_value: UNKNOWN_FACT_TEXT, sources: [], verification_events: [], status: "needs_review", last_verified_at: null })).level, 0);
  assert.equal(getClaimVerificationLevel(claim({ sources: [], verification_events: [], status: "needs_review", last_verified_at: null })).level, 1);
  assert.equal(getClaimVerificationLevel(claim({ verification_events: [], status: "needs_review", last_verified_at: null })).level, 2);
  assert.equal(getClaimVerificationLevel(claim({ last_verified_at: "2025-12-28" }), 180, NOW).level, 3);
  assert.equal(getClaimVerificationLevel(claim(), 180, NOW).level, 4);
  assert.equal(getClaimVerificationLevel(claim({ sources: [source(), source({ id: "src-2", url: "https://example.gov/second" })] }), 180, NOW).level, 5);

  const sourcedButUnverified = getClaimCitationStatus(claim({ verification_events: [], status: "needs_review", last_verified_at: null }));
  assert.equal(sourcedButUnverified.verificationLevel.level, 2);
  assert.equal(sourcedButUnverified.isCitationReady, false);
});

test("getClaimCitationStatus marks fully sourced verified claims as citation-ready", () => {
  const status = getClaimCitationStatus(claim(), 180, NOW);
  assert.equal(status.isCitationReady, true);
  assert.equal(status.label, "verified");
});

test("getClaimCitationStatus keeps claims without sources out of citation-ready", () => {
  const status = getClaimCitationStatus(claim({ sources: [] }), 180, NOW);

  assertUnverified(status);
  assert.equal(status.reason, "requires verified status, non-low confidence, source, verification event, and last_verified_at");
  assert.equal(status.verificationLevel.level, 1);
});

test("getClaimCitationStatus keeps low confidence claims out of citation-ready", () => {
  const status = getClaimCitationStatus(claim({ confidence: "low" }), 180, NOW);

  assertUnverified(status);
  assert.equal(status.verificationLevel.level, 2);
});

test("getClaimCitationStatus keeps unknown placeholder values out of citation-ready", () => {
  const status = getClaimCitationStatus(claim({ claim_value: UNKNOWN_FACT_TEXT }), 180, NOW);

  assertUnverified(status);
  assert.equal(status.verificationLevel.level, 2);
});

test("getClaimCitationStatus rejects missing last_verified_at", () => {
  assertUnverified(getClaimCitationStatus(claim({ last_verified_at: null }), 180, NOW));
});

test("getClaimCitationStatus requires an explicit verification event", () => {
  const status = getClaimCitationStatus(claim({ verification_events: [] }));
  assertUnverified(status);
  assert.equal(status.isCitationReady, false);
  assert.equal(status.label, "unverified");
});

test("getVerifiedClaimViolations reports every verified transition requirement", () => {
  assert.deepEqual(
    getVerifiedClaimViolations(claim({
      claim_value: UNKNOWN_FACT_TEXT,
      confidence: "low",
      status: "needs_review",
      last_verified_at: null,
      sources: [],
      verification_events: [],
    })),
    [
      "claim_value must not be the unknown placeholder",
      "confidence must be medium or high",
      "at least one source is required",
      "last_verified_at is required",
      "verification event is required",
      "admin approval must set status to verified",
    ],
  );
});

test("getDocumentCitationStatus requires verified document status and every claim to be ready", () => {
  const approved = getDocumentCitationStatus(bundle([claim()]), 180, NOW);
  assert.equal(approved.isVerifiedDocument, true);
  assert.equal(approved.verifiedClaims, 1);
  assert.equal(approved.unverifiedClaims, 0);
  assert.equal(approved.label, "citation ready");

  const draft = getDocumentCitationStatus(bundle([claim()], { document: document({ status: "needs_review" }) }), 180, NOW);
  assert.equal(draft.isVerifiedDocument, false);
  assert.equal(draft.label, "do not cite");

  const mixed = getDocumentCitationStatus(bundle([claim(), claim({ id: "claim-2", claim_value: UNKNOWN_FACT_TEXT })]), 180, NOW);
  assert.equal(mixed.isVerifiedDocument, false);
  assert.equal(mixed.verifiedClaims, 1);
  assert.equal(mixed.unverifiedClaims, 1);
  assert.equal(mixed.label, "do not cite");
});

test("getDocumentCitationStatus is citation-ready only when all claims are verified and source-backed", () => {
  const noSource = claim({ id: "claim-no-source", field_path: "fare.no_source", sources: [] });
  const lowConfidence = claim({ id: "claim-low-confidence", field_path: "fare.low_confidence", confidence: "low" });
  const unknownValue = claim({ id: "claim-unknown", field_path: "fare.unknown", claim_value: UNKNOWN_FACT_TEXT });

  const blocked = getDocumentCitationStatus(bundle([claim(), noSource, lowConfidence, unknownValue]), 180, NOW);

  assert.equal(blocked.isVerifiedDocument, false);
  assert.equal(blocked.label, "do not cite");
  assert.equal(blocked.verifiedClaims, 1);
  assert.equal(blocked.unverifiedClaims, 3);

  const approved = getDocumentCitationStatus(bundle([
    claim({ id: "claim-1", field_path: "fare.base_adult" }),
    claim({ id: "claim-2", field_path: "fare.base_youth", claim_value: "800원" }),
  ]), 180, NOW);

  assert.equal(approved.isVerifiedDocument, true);
  assert.equal(approved.label, "citation ready");
  assert.equal(approved.verifiedClaims, 2);
  assert.equal(approved.unverifiedClaims, 0);
});

test("getDocumentCitationStatus reports freshness from the oldest ready claim", () => {
  const fresh = getDocumentCitationStatus(bundle([claim({ last_verified_at: "2026-06-20" })]), 180);
  assert.equal(fresh.freshness, "fresh");
  assert.equal(fresh.oldestVerifiedAt, "2026-06-20");

  const stale = getDocumentCitationStatus(bundle([claim({ last_verified_at: "2025-12-28" })]), 180);
  assert.equal(stale.freshness, "stale");
  assert.equal(stale.oldestVerifiedAt, "2025-12-28");
});

test("getDocumentCitationStatus uses short commerce policy TTL by default", () => {
  const commerce = getDocumentCitationStatus(bundle([
    claim({
      field_path: "return.window_days",
      last_verified_at: "2026-05-27",
    }),
  ], {
    document: document({
      category: "commerce",
      template: "commerce_policy",
    }),
  }), undefined, NOW);

  assert.equal(commerce.freshness, "stale");

  const explicitTtl = getDocumentCitationStatus(bundle([
    claim({ last_verified_at: "2026-05-27" }),
  ], {
    document: document({ data: { freshness_ttl_days: 45 } }),
  }), undefined, NOW);

  assert.equal(explicitTtl.freshness, "fresh");
});

test("domain freshness windows are applied and stale claims stay citable with warnings", () => {
  assert.equal(getFreshnessWindowDays("transport.metro fare.base_adult"), 180);
  assert.equal(getFreshnessWindowDays("government passport fee"), 180);
  assert.equal(getFreshnessWindowDays("visa travel entry rule"), 90);
  assert.equal(getFreshnessWindowDays("finance bank rate"), 30);

  const staleClaim = claim({ last_verified_at: "2026-05-20" });
  const status = getClaimCitationStatus(staleClaim, 30, NOW);
  assert.equal(status.isCitationReady, true);
  assert.equal(status.label, "stale");
  assert.equal(status.freshness, "stale");
  assert.match(status.warning ?? "", /last verified at 2026-05-20/);

  const docStatus = getDocumentCitationStatus(bundle([staleClaim], {
    document: document({ category: "finance.bank.rate" }),
  }), undefined, NOW);
  assert.equal(docStatus.freshnessWindowDays, 30);
  assert.equal(docStatus.freshness, "stale");
  assert.deepEqual(docStatus.staleClaims, [{ claimId: "claim-1", fieldPath: "fare.base_adult", lastVerifiedAt: "2026-05-20" }]);
});

test("getFreshnessPolicy uses document update_frequency metadata", () => {
  const staticPolicy = getFreshnessPolicy(bundle([claim()], { document: document({ data: { update_frequency: "static" } }) }));
  assert.equal(staticPolicy.ttlDays, 365);
  assert.equal(staticPolicy.updateFrequency, "static");

  const annualPolicy = getFreshnessPolicy(bundle([claim()], { document: document({ data: { update_frequency: "annual" } }) }));
  assert.equal(annualPolicy.ttlDays, 370);

  const eventPolicy = getFreshnessPolicy(bundle([claim()], { document: document({ data: { update_frequency: "event_based" } }) }));
  assert.equal(eventPolicy.ttlDays, 180);
});

test("getDocumentCitationStatus applies metadata TTL unless explicitly overridden", () => {
  // Verified within the 365-day static window but well past a 180-day override.
  const oldStatic = bundle([claim({ last_verified_at: isoDaysAgo(200) })], {
    document: document({ data: { update_frequency: "static" } }),
  });
  assert.equal(getDocumentCitationStatus(oldStatic, undefined).freshness, "fresh");
  assert.equal(getDocumentCitationStatus(oldStatic, undefined).freshnessWindowDays, 365);
  assert.equal(getDocumentCitationStatus(oldStatic, 180).freshness, "stale");

  // Explicit 30-day TTL, verified 60 days ago → stale regardless of run date.
  const explicitTtl = bundle([claim({ last_verified_at: isoDaysAgo(60) })], {
    document: document({ data: { update_frequency: "static", freshness_ttl_days: 30 } }),
  });
  assert.equal(getDocumentCitationStatus(explicitTtl, undefined).freshnessWindowDays, 30);
  assert.equal(getDocumentCitationStatus(explicitTtl, undefined).freshness, "stale");
});

test("getCanonicalDirectAnswer returns the first citation-ready value or the unknown placeholder", () => {
  assert.equal(getCanonicalDirectAnswer(bundle([claim({ claim_value: UNKNOWN_FACT_TEXT }), claim({ id: "claim-2", claim_value: "Ready value" })])), "Ready value");
  assert.equal(getCanonicalDirectAnswer(bundle([claim({ claim_value: UNKNOWN_FACT_TEXT })])), UNKNOWN_FACT_TEXT);
});

test("business-submitted pending claims stay citation-ready false even if they look sourced", () => {
  const status = getClaimCitationStatus(claim({
    source_of_claim: "business_submitted",
    business_submission_status: "pending_verification",
  }));

  assert.equal(status.isCitationReady, false);
  assert.equal(status.reason, "business-submitted claim is pending human verification");

  const documentStatus = getDocumentCitationStatus(bundle([
    claim(),
    claim({
      id: "business-claim-1",
      source_of_claim: "business_submitted",
      business_submission_status: "pending_verification",
    }),
  ]));
  assert.equal(documentStatus.isVerifiedDocument, false);
  assert.equal(documentStatus.verifiedClaims, 1);
  assert.equal(documentStatus.unverifiedClaims, 1);
});

test("high-risk machine translations are not citation-ready until human translation review", () => {
  const status = getClaimCitationStatus(claim({
    id: "claim-translated-high-risk",
    risk_tier: "high",
    original_claim_id: "claim-source-1",
    translation_status: "machine_translated",
  }), 180, NOW, "finance");

  assert.equal(status.isCitationReady, false);
  assert.match(status.reason, /human-reviewed translation/);
});

test("high-risk human translated claims can be citation-ready when other verification signals pass", () => {
  const status = getClaimCitationStatus(claim({
    id: "claim-translated-high-risk",
    risk_tier: "high",
    original_claim_id: "claim-source-1",
    translation_status: "human_translated",
  }), 180, NOW, "finance");

  assert.equal(status.isCitationReady, true);
});
