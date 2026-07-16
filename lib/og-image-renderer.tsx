import "server-only";

import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import React from "react";

import { getDocumentCitationStatus } from "./citation-status";
import { presentationForKey, type PresentationKey } from "./citation-presentation";
import { DEFAULT_LOCALE, isValidLocale, type SupportedLocale } from "./i18n";
import type { ClaimStatus, ClaimWithSources, RegistryDocumentBundle } from "./types";

export type SocialImageKind = "opengraph" | "twitter";
export type SocialImageStatusKey = Exclude<PresentationKey, "unavailable">;

export type SocialImageViewModel = {
  locale: SupportedLocale;
  headline: string;
  headlineSource: "representative_claim" | "verified_claim" | "document_title" | "english_fallback" | "generic_fallback";
  sourceCount: number;
  statusKey: SocialImageStatusKey;
  statusLabel: string;
  statusTone: "ready" | "review" | "disputed" | "unknown";
};

export const SOCIAL_IMAGE_FALLBACK_HEADLINE = "For-Ai fact registry";
export const SOCIAL_IMAGE_MAX_HEADLINE_CHARS = 90;
export const SOCIAL_IMAGE_FONT_ASSET_BUDGET_BYTES = 400_000;
// ImageResponse defaults to "public, immutable, no-transform, max-age=31536000"
// regardless of the route's `revalidate` export, so it must be overridden
// explicitly (matches the badge route's existing 600s convention — see
// badgeCacheControl in lib/citation-badge.ts).
export const SOCIAL_IMAGE_CACHE_CONTROL = "public, max-age=600, s-maxage=600";

const UNSUPPORTED_SCRIPT = /[^\u0000-\u024f\u2000-\u206f\u20a0-\u20cf\uac00-\ud7a3]/u;
const HANGUL_SYLLABLE = /[\uac00-\ud7a3]/gu;
const SOCIAL_IMAGE_HANGUL_GLYPHS = new Set(Array.from(readFileSync(
  join(process.cwd(), "assets/fonts/nanum-gothic-for-ai-hangul.glyphs.txt"),
  "utf8",
).trim()));

const CLAIM_STATUS_TO_PRESENTATION = {
  verified: "verified",
  needs_review: "needs_review",
  disputed: "disputed",
  unknown: "unknown",
} satisfies Record<ClaimStatus, SocialImageStatusKey>;

const STATUS_TONE = {
  verified: "ready",
  needs_review: "review",
  disputed: "disputed",
  unknown: "unknown",
} satisfies Record<SocialImageStatusKey, SocialImageViewModel["statusTone"]>;

const TONE_COLORS: Record<SocialImageViewModel["statusTone"], { bg: string; fg: string; border: string }> = {
  ready: { bg: "#dcfce7", fg: "#166534", border: "#86efac" },
  review: { bg: "#fef3c7", fg: "#92400e", border: "#fcd34d" },
  disputed: { bg: "#fee2e2", fg: "#991b1b", border: "#fecaca" },
  unknown: { bg: "#e2e8f0", fg: "#475569", border: "#cbd5e1" },
};

function isEligibleClaim(claim: ClaimWithSources): boolean {
  return claim.source_of_claim !== "sponsored"
    && !(claim.source_of_claim === "business_submitted" && claim.business_submission_status === "pending_verification");
}

function representativeClaim(bundle: RegistryDocumentBundle): ClaimWithSources | null {
  const claims = bundle.claims.filter(isEligibleClaim);
  const data = bundle.document.data ?? {};
  const configured = [data.representative_claim_id, data.representativeClaimId, data.representative_claim]
    .find((value): value is string => typeof value === "string" && value.trim().length > 0)
    ?.trim();

  if (configured) {
    const match = claims.find((claim) => claim.id === configured || claim.claim_text === configured);
    if (match) return match;
  }

  return claims.find((claim) => {
    const flags = claim as ClaimWithSources & { representative?: boolean; is_representative?: boolean };
    return flags.representative === true || flags.is_representative === true;
  }) ?? null;
}

function truncateHeadline(value: string): string {
  const characters = Array.from(value.trim());
  if (characters.length <= SOCIAL_IMAGE_MAX_HEADLINE_CHARS) return characters.join("");
  return `${characters.slice(0, 87).join("")}...`;
}

function englishCanonicalTitle(bundle: RegistryDocumentBundle): string | null {
  const localizedEnglish = bundle.document.localized_title?.en?.trim();
  if (localizedEnglish) return localizedEnglish;
  if (bundle.document.lang === "en" && bundle.document.title.trim()) return bundle.document.title.trim();
  return null;
}

function requiresEnglishFallback(headline: string): boolean {
  if (UNSUPPORTED_SCRIPT.test(headline)) return true;
  return Array.from(headline.matchAll(HANGUL_SYLLABLE)).some(([glyph]) => !SOCIAL_IMAGE_HANGUL_GLYPHS.has(glyph));
}

export function getSocialImageHeadline(
  bundle: RegistryDocumentBundle,
  locale: string = bundle.document.lang,
): Pick<SocialImageViewModel, "headline" | "headlineSource"> {
  const representative = representativeClaim(bundle);
  const verifiedClaims = bundle.claims.filter((claim) => isEligibleClaim(claim) && claim.status === "verified");
  const verified = verifiedClaims.find((claim) => claim.lang === locale) ?? verifiedClaims[0];
  const localizedDocumentTitle = bundle.document.localized_title?.[locale]?.trim() || bundle.document.title.trim();
  // representativeText/verifiedText are computed once and reused for both the
  // headline and its recorded source, so a representative/verified claim with
  // blank text is never labeled as the origin of a headline it didn't supply.
  const representativeText = representative?.claim_text.trim();
  const verifiedText = verified?.claim_text.trim();
  const rawHeadline = representativeText || verifiedText || localizedDocumentTitle || SOCIAL_IMAGE_FALLBACK_HEADLINE;
  const rawSource: SocialImageViewModel["headlineSource"] = representativeText
    ? "representative_claim"
    : verifiedText
      ? "verified_claim"
      : localizedDocumentTitle
        ? "document_title"
        : "generic_fallback";

  if (requiresEnglishFallback(rawHeadline)) {
    const fallback = englishCanonicalTitle(bundle);
    return {
      headline: truncateHeadline(fallback ?? SOCIAL_IMAGE_FALLBACK_HEADLINE),
      headlineSource: fallback ? "english_fallback" : "generic_fallback",
    };
  }

  return { headline: truncateHeadline(rawHeadline), headlineSource: rawSource };
}

function sourceRelationIsActive(source: ClaimWithSources["sources"][number]): boolean {
  const relation = source as typeof source & { active?: boolean; is_active?: boolean };
  return relation.active !== false && relation.is_active !== false;
}

// Different claims on the same document commonly cite the same official page
// as separate source records (each with its own id) — e.g. four fee claims
// all pointing at the same gov.kr URL. Deduping by id would count that as 4
// distinct sources; dedupe by normalized URL instead so the badge reflects
// the number of actual evidence pages, not the number of claim-source rows.
// A null/empty url can't be deduped against other sources by identity, so
// each falls back to counting by its own id (never collapsed with another
// source, matching the pre-dedup behavior for this edge case).
function normalizedSourceUrl(source: ClaimWithSources["sources"][number]): string {
  const trimmed = source.url?.trim().toLowerCase().replace(/\/+$/, "");
  return trimmed || `no-url:${source.id}`;
}

export function getSocialImageSourceCount(bundle: RegistryDocumentBundle): number {
  return new Set(
    bundle.claims
      .filter(isEligibleClaim)
      .flatMap((claim) => claim.sources)
      .filter(sourceRelationIsActive)
      .map((source) => normalizedSourceUrl(source)),
  ).size;
}

export function mapSocialImageStatus(
  bundle: RegistryDocumentBundle,
): Pick<SocialImageViewModel, "statusKey" | "statusLabel" | "statusTone"> {
  const eligibleClaims = bundle.claims.filter(isEligibleClaim);
  let statusKey: SocialImageStatusKey;

  if (eligibleClaims.some((claim) => CLAIM_STATUS_TO_PRESENTATION[claim.status] === "disputed")) {
    statusKey = "disputed";
  } else if (getDocumentCitationStatus({ ...bundle, claims: eligibleClaims }).isVerifiedDocument) {
    statusKey = "verified";
  } else if (eligibleClaims.some((claim) => CLAIM_STATUS_TO_PRESENTATION[claim.status] === "needs_review" || claim.status === "verified")) {
    statusKey = "needs_review";
  } else {
    statusKey = "unknown";
  }

  return {
    statusKey,
    statusLabel: presentationForKey(statusKey).machineLabel,
    statusTone: STATUS_TONE[statusKey],
  };
}

export function buildSocialImageViewModel(bundle: RegistryDocumentBundle, locale: string): SocialImageViewModel {
  const safeLocale = isValidLocale(locale) ? locale : DEFAULT_LOCALE;
  return {
    locale: safeLocale,
    ...getSocialImageHeadline(bundle, safeLocale),
    sourceCount: getSocialImageSourceCount(bundle),
    ...mapSocialImageStatus(bundle),
  };
}

const fontDataPromise = Promise.all([
  readFile(join(process.cwd(), "node_modules/@fontsource/nanum-gothic/files/nanum-gothic-latin-400-normal.woff")),
  readFile(join(process.cwd(), "assets/fonts/nanum-gothic-for-ai-hangul.woff")),
]);

export async function getSocialImageFonts() {
  const [latin, hangul] = await fontDataPromise;
  return [
    { name: "Nanum Gothic", data: latin, style: "normal" as const, weight: 400 as const },
    { name: "Nanum Gothic", data: hangul, style: "normal" as const, weight: 400 as const },
  ];
}

export function renderSocialImage(vm: SocialImageViewModel, kind: SocialImageKind) {
  const tone = TONE_COLORS[vm.statusTone];
  return React.createElement(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        background: "linear-gradient(135deg, #0f172a 0%, #1e3a8a 55%, #0f766e 100%)",
        color: "white",
        fontFamily: "Nanum Gothic",
        fontWeight: 400,
      },
    },
    React.createElement(
      "div",
      { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 24 } },
      React.createElement("div", { style: { fontSize: 34, letterSpacing: -1 } }, "For-Ai"),
      React.createElement("div", { style: { fontSize: 22, opacity: 0.84 } }, kind === "twitter" ? "Twitter/X" : "Open Graph"),
    ),
    React.createElement(
      "div",
      { style: { display: "flex", flexDirection: "column", gap: 26 } },
      React.createElement("div", { style: { fontSize: 24, textTransform: "uppercase", letterSpacing: 3, opacity: 0.78 } }, "AI-citable claim registry"),
      React.createElement("div", { style: { fontSize: 68, lineHeight: 1.08, letterSpacing: -2, maxWidth: 1056 } }, vm.headline),
    ),
    React.createElement(
      "div",
      { style: { display: "flex", gap: 18, alignItems: "center", fontSize: 26 } },
      React.createElement("div", { style: { padding: "14px 22px", borderRadius: 999, background: tone.bg, color: tone.fg, border: `2px solid ${tone.border}` } }, vm.statusLabel),
      React.createElement("div", { style: { padding: "14px 22px", borderRadius: 999, background: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.28)" } }, `${vm.sourceCount} sources`),
      React.createElement("div", { style: { marginInlineStart: "auto", opacity: 0.82 } }, "for-ai.org"),
    ),
  );
}
