import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  SOCIAL_IMAGE_FONT_ASSET_BUDGET_BYTES,
  buildSocialImageViewModel,
  getSocialImageHeadline,
  getSocialImageSourceCount,
  mapSocialImageStatus,
} from "../lib/og-image-renderer";
import { SUPPORTED_LOCALES } from "../lib/i18n/locales";
import type { ClaimSource, ClaimWithSources, RegistryDocumentBundle } from "../lib/types";

function source(id: string, extra: Record<string, unknown> = {}): ClaimSource {
  return {
    id,
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
    ...extra,
  } as ClaimSource;
}

function claim(overrides: Partial<ClaimWithSources> = {}): ClaimWithSources {
  return {
    id: "claim-1",
    document_id: "doc-1",
    entity_id: "entity-1",
    field_path: "field",
    claim_text: "A verified representative fact",
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
    sources: [source("source-1")],
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
      created_at: "2026-07-01",
    }],
    ...overrides,
  };
}

function bundle(
  documentOverrides: Partial<RegistryDocumentBundle["document"]> = {},
  claims: ClaimWithSources[] = [claim()],
): RegistryDocumentBundle {
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
      title: "English canonical title",
      localized_title: { en: "English canonical title", ko: "한국어 제목", es: "Título español", hi: "हिंदी शीर्षक", ar: "عنوان عربي", ja: "日本語のタイトル", zh: "中文标题" },
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
      ...documentOverrides,
    },
    claims,
    listing: null,
  };
}

test("headline uses representative claim, then verified claim, then localized document title", () => {
  const representative = claim({ id: "claim-2", status: "needs_review", claim_text: "Representative claim" });
  const configured = bundle({ data: { representative_claim_id: "claim-2" } }, [claim(), representative]);
  assert.deepEqual(getSocialImageHeadline(configured, "en"), {
    headline: "Representative claim",
    headlineSource: "representative_claim",
  });

  assert.equal(getSocialImageHeadline(bundle(), "en").headlineSource, "verified_claim");
  assert.deepEqual(getSocialImageHeadline(bundle({}, []), "es"), {
    headline: "Título español",
    headlineSource: "document_title",
  });
});

test("headline is capped at 90 characters using 87 characters plus three dots", () => {
  const longClaim = claim({ claim_text: "a".repeat(91) });
  const headline = getSocialImageHeadline(bundle({}, [longClaim]), "en").headline;
  assert.equal(Array.from(headline).length, 90);
  assert.equal(headline, `${"a".repeat(87)}...`);
});

test("unsupported scripts use the English canonical title while Latin and Hangul render directly", () => {
  const titleOnly = bundle({}, []);
  for (const locale of ["hi", "ar", "ja", "zh"] as const) {
    assert.deepEqual(getSocialImageHeadline(titleOnly, locale), {
      headline: "English canonical title",
      headlineSource: "english_fallback",
    });
  }
  assert.equal(getSocialImageHeadline(titleOnly, "ko").headline, "한국어 제목");
  assert.equal(getSocialImageHeadline(titleOnly, "es").headline, "Título español");

  const outOfSubsetHangul = bundle({}, [claim({ claim_text: "뙇" })]);
  assert.equal(getSocialImageHeadline(outOfSubsetHangul, "ko").headlineSource, "english_fallback");
});

test("all seven locales produce a supported headline or the explicit English fallback", () => {
  const titleOnly = bundle({}, []);
  for (const locale of SUPPORTED_LOCALES) {
    const vm = buildSocialImageViewModel(titleOnly, locale);
    assert.equal(vm.locale, locale);
    assert.ok(vm.headline.length > 0);
    if (["hi", "ar", "ja", "zh"].includes(locale)) assert.equal(vm.headlineSource, "english_fallback");
  }
});

test("source count deduplicates active source relations and excludes sponsored claims", () => {
  const first = claim({ sources: [source("shared"), source("inactive", { active: false })] });
  const second = claim({ id: "claim-2", sources: [source("shared")] });
  const sponsored = claim({ id: "claim-3", source_of_claim: "sponsored", sources: [source("sponsored")] });
  assert.equal(getSocialImageSourceCount(bundle({}, [first, second, sponsored])), 1);
});

test("status uses the closed schema presentation for verified, review, disputed, and unknown", () => {
  assert.deepEqual(mapSocialImageStatus(bundle()), { statusKey: "verified", statusLabel: "Verified", statusTone: "ready" });
  assert.deepEqual(mapSocialImageStatus(bundle({}, [claim({ status: "needs_review", confidence: "low", sources: [], verification_events: [] })])), { statusKey: "needs_review", statusLabel: "Needs review", statusTone: "review" });
  assert.deepEqual(mapSocialImageStatus(bundle({}, [claim({ status: "disputed", confidence: "low", sources: [], verification_events: [] })])), { statusKey: "disputed", statusLabel: "Disputed", statusTone: "disputed" });
  assert.deepEqual(mapSocialImageStatus(bundle({}, [])), { statusKey: "unknown", statusLabel: "Unknown", statusTone: "unknown" });
});

test("OG and Twitter routes declare literal node runtime, cache, dimensions, content type, and alt", () => {
  for (const file of [
    "app/[locale]/wiki/[slug]/opengraph-image.tsx",
    "app/[locale]/wiki/[slug]/twitter-image.tsx",
  ]) {
    const route = readFileSync(file, "utf8");
    assert.match(route, /export const runtime = "nodejs";/);
    assert.match(route, /export const revalidate = 600;/);
    assert.match(route, /export const size = \{ width: 1200, height: 630 \};/);
    assert.match(route, /export const contentType = "image\/png";/);
    assert.match(route, /export const alt = "For-Ai claim verification status";/);
  }
});

test("Latin and Hangul font assets stay inside the social image asset budget", () => {
  const bytes = [
    join(process.cwd(), "node_modules/@fontsource/nanum-gothic/files/nanum-gothic-latin-400-normal.woff"),
    join(process.cwd(), "assets/fonts/nanum-gothic-for-ai-hangul.woff"),
  ].reduce((total, path) => total + statSync(path).size, 0);
  assert.ok(bytes <= SOCIAL_IMAGE_FONT_ASSET_BUDGET_BYTES, `${bytes} exceeds ${SOCIAL_IMAGE_FONT_ASSET_BUDGET_BYTES}`);

  const config = readFileSync("next.config.ts", "utf8");
  assert.match(config, /outputFileTracingIncludes/);
  assert.match(config, /nanum-gothic-latin-400-normal\.woff/);
  assert.match(config, /nanum-gothic-for-ai-hangul\.woff/);
});

test("the committed Hangul subset covers every committed registry headline glyph", () => {
  const manifest = new Set(Array.from(readFileSync("assets/fonts/nanum-gothic-for-ai-hangul.glyphs.txt", "utf8")));
  const registryText = [
    readFileSync("lib/seed-data.ts", "utf8"),
    ...readdirSync("data/verified-claims")
      .filter((file) => file.endsWith(".json"))
      .map((file) => readFileSync(join("data/verified-claims", file), "utf8")),
  ].join("\n");
  const missing = Array.from(new Set(registryText.match(/[\uac00-\ud7a3]/gu) ?? []))
    .filter((glyph) => !manifest.has(glyph));
  assert.deepEqual(missing, []);
});

test("metadata relies on file-based image routes and keeps summary_large_image", () => {
  const seo = readFileSync("lib/seo.ts", "utf8");
  assert.doesNotMatch(seo, /wiki\/\$\{document\.slug\}\/(?:opengraph|twitter)-image/);
  assert.match(seo, /card: "summary_large_image"/);
});
