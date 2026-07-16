import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildSocialImageViewModel, getSocialImageHeadline, getSocialImageSourceCount, mapSocialImageStatus } from "../lib/og-image-renderer";
import type { ClaimWithSources, RegistryDocumentBundle } from "../lib/types";

function claim(overrides: Partial<ClaimWithSources> = {}): ClaimWithSources {
  return {
    id: "claim-1",
    document_id: "doc-1",
    entity_id: "entity-1",
    field_path: "field",
    claim_text: "Claim text",
    claim_value: "Known value",
    jurisdiction: "global",
    country: "US",
    region: null,
    city: null,
    risk_tier: "standard",
    update_frequency: "static",
    disclaimer_type: "none",
    lang: "en",
    original_claim_id: null,
    translation_status: null,
    confidence: "high",
    status: "verified",
    last_verified_at: "2026-07-01",
    created_at: null,
    updated_at: null,
    sources: [{
      id: "source-1",
      claim_id: "claim-1",
      source_type: "official",
      source_authority: "official",
      title: "Official source",
      url: "https://example.com",
      citation: null,
      lang: "en",
      observed_at: null,
      contributor_hash: null,
      created_at: null,
    }],
    verification_events: [{
      id: "event-1",
      claim_id: "claim-1",
      event_type: "source_verified",
      previous_status: "needs_review",
      new_status: "verified",
      previous_confidence: "medium",
      new_confidence: "high",
      note: null,
      contributor_hash: null,
      created_at: null,
    }],
    ...overrides,
  };
}

function bundle(overrides: Partial<RegistryDocumentBundle> = {}, claims: ClaimWithSources[] = [claim()]): RegistryDocumentBundle {
  return {
    entity: { id: "entity-1", type: "organization", canonical_name: "Entity", country: "US", region: null, city: null, created_at: null, updated_at: null },
    document: {
      id: "doc-1",
      entity_id: "entity-1",
      slug: "example-fact",
      lang: "en",
      country: "US",
      region: null,
      city: null,
      jurisdiction: "global",
      canonical_slug: "example-fact",
      title: "English title",
      localized_title: { en: "English title", ko: "한국어 제목" },
      category: "test",
      template: "claim",
      status: "verified",
      confidence: "high",
      risk_tier: "standard",
      update_frequency: "static",
      disclaimer_type: "none",
      translation_status: "source_language",
      last_verified_at: "2026-07-01",
      license_code: "CC-BY-4.0",
      data: {},
      created_at: null,
      updated_at: null,
    },
    claims,
    listing: null,
    ...overrides,
  };
}

test("uses localized headline with explicit English fallback", () => {
  const b = bundle();
  assert.equal(getSocialImageHeadline(b, "ko"), "한국어 제목");
  assert.equal(getSocialImageHeadline(b, "ja"), "English title");
});

test("counts all claim sources for the badge", () => {
  const b = bundle({}, [claim(), claim({ id: "claim-2", sources: [] })]);
  assert.equal(getSocialImageSourceCount(b), 1);
});

test("maps verified, mixed, stale, and unverified statuses", () => {
  assert.deepEqual(mapSocialImageStatus(bundle()), { statusLabel: "Citation-ready", statusTone: "ready" });
  assert.deepEqual(mapSocialImageStatus(bundle({}, [claim(), claim({ id: "claim-2", status: "needs_review", confidence: "low", sources: [], verification_events: [] })])), { statusLabel: "Mixed", statusTone: "mixed" });
  assert.deepEqual(mapSocialImageStatus(bundle({}, [claim({ last_verified_at: "2020-01-01" })])), { statusLabel: "Stale", statusTone: "stale" });
  assert.deepEqual(mapSocialImageStatus(bundle({}, [claim({ status: "needs_review", confidence: "low", sources: [], verification_events: [] })])), { statusLabel: "Needs verification", statusTone: "review" });
});

test("normalizes unsupported route locale to English and Arabic direction to RTL", () => {
  assert.equal(buildSocialImageViewModel(bundle(), "xx").locale, "en");
  assert.equal(buildSocialImageViewModel(bundle(), "ar").direction, "rtl");
});


test("OG and Twitter image route files declare literal cache and image config", () => {
  for (const file of [
    "app/[locale]/wiki/[slug]/opengraph-image.tsx",
    "app/[locale]/wiki/[slug]/twitter-image.tsx",
  ]) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /export const runtime = "edge";/);
    assert.match(source, /export const revalidate = 600;/);
    assert.match(source, /export const size = \{ width: 1200, height: 630 \};/);
    assert.match(source, /export const contentType = "image\/png";/);
  }
});
