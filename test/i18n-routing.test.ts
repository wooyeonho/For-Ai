import test from "node:test";
import assert from "node:assert/strict";
import { SUPPORTED_LOCALES, type SupportedLocale } from "../lib/i18n/locales";
import {
  I18N_PRIMARY_ROUTE_BUILDERS,
  I18N_SMOKE_TEST_SLUG,
  getCurrentLocaleFromPath,
  getHallucinationReturnUrl,
  getLocalePath,
  getReportReturnUrl,
  getSuggestTopicHref,
} from "../lib/i18n/routing";

function primaryRoutes(locale: SupportedLocale): string[] {
  return I18N_PRIMARY_ROUTE_BUILDERS.map((build) => build(locale, I18N_SMOKE_TEST_SLUG));
}

test("all supported locales have stable primary route shapes", () => {
  for (const locale of SUPPORTED_LOCALES) {
    assert.deepEqual(primaryRoutes(locale), [
      `/${locale}`,
      `/${locale}/wiki/${I18N_SMOKE_TEST_SLUG}`,
      `/${locale}/topics`,
      `/${locale}/countries`,
      `/${locale}/bounties`,
    ]);
  }
});

test("LanguageSelector helper swaps locale prefixes without changing route identity", () => {
  for (const locale of SUPPORTED_LOCALES) {
    assert.equal(getLocalePath("/ko", locale), `/${locale}`);
    assert.equal(getLocalePath("/ko/wiki/myungdong-laluce-parking", locale), `/${locale}/wiki/myungdong-laluce-parking`);
    assert.equal(getLocalePath("/ko/topics", locale), `/${locale}/topics`);
    assert.equal(getLocalePath("/ko/countries", locale), `/${locale}/countries`);
    assert.equal(getLocalePath("/ko/bounties", locale), `/${locale}/bounties`);
  }
});

test("LanguageSelector helper preserves non-localized utility pages", () => {
  assert.equal(getLocalePath("/community", "ja"), "/community");
  assert.equal(getLocalePath("/api-docs", "ar"), "/api-docs");
});

test("LanguageSelector helper converts report and hallucination pages back to localized wiki return URLs", () => {
  for (const locale of SUPPORTED_LOCALES) {
    assert.equal(getLocalePath("/report/passport-reissue-fee", locale), `/${locale}/wiki/passport-reissue-fee`);
    assert.equal(getLocalePath("/hallucination/passport-reissue-fee", locale), `/${locale}/wiki/passport-reissue-fee`);
    assert.equal(getReportReturnUrl(locale, "passport-reissue-fee"), `/${locale}/wiki/passport-reissue-fee`);
    assert.equal(getHallucinationReturnUrl(locale, "passport-reissue-fee"), `/${locale}/wiki/passport-reissue-fee`);
  }
});

test("current locale detection falls back to configured default for non-locale paths", () => {
  assert.equal(getCurrentLocaleFromPath("/ja/wiki/bts-members-agency"), "ja");
  assert.equal(getCurrentLocaleFromPath("/report/bts-members-agency"), "en");
});

test("suggest-topic CTA carries the failed query and locale into the form", () => {
  assert.equal(getSuggestTopicHref("passport fee", "ko"), "/suggest-topic?q=passport%20fee&lang=ko");
  assert.equal(getSuggestTopicHref("  여권 수수료  ", "ko"), `/suggest-topic?q=${encodeURIComponent("여권 수수료")}&lang=ko`);
  assert.equal(getSuggestTopicHref("", "ja"), "/suggest-topic?lang=ja");
  assert.equal(getSuggestTopicHref("   ", "en"), "/suggest-topic?lang=en");
});
