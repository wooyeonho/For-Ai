import React from "react";
import type { RegistryDocumentBundle } from "./types";
import { getDocumentCitationStatus } from "./citation-status";
import { DEFAULT_LOCALE, isValidLocale, type SupportedLocale } from "./i18n";

export const OG_IMAGE_SIZE = { width: 1200, height: 630 } as const;
export const TWITTER_IMAGE_SIZE = { width: 1200, height: 630 } as const;

export type SocialImageKind = "opengraph" | "twitter";

export type SocialImageViewModel = {
  locale: SupportedLocale;
  headline: string;
  sourceCount: number;
  statusLabel: "Citation-ready" | "Mixed" | "Needs verification" | "Stale";
  statusTone: "ready" | "mixed" | "review" | "stale";
  eyebrow: string;
  direction: "ltr" | "rtl";
};

const FALLBACK_HEADLINE = "For-Ai fact registry";

export function getSocialImageHeadline(bundle: RegistryDocumentBundle, locale: string): string {
  const localized = bundle.document.localized_title?.[locale];
  return (localized || bundle.document.localized_title?.en || bundle.document.title || FALLBACK_HEADLINE).trim();
}

export function getSocialImageSourceCount(bundle: RegistryDocumentBundle): number {
  return bundle.claims.reduce((sum, claim) => sum + claim.sources.length, 0);
}

export function mapSocialImageStatus(bundle: RegistryDocumentBundle): Pick<SocialImageViewModel, "statusLabel" | "statusTone"> {
  const status = getDocumentCitationStatus(bundle);
  if (status.freshness === "stale") return { statusLabel: "Stale", statusTone: "stale" };
  if (status.isVerifiedDocument) return { statusLabel: "Citation-ready", statusTone: "ready" };
  if (status.verifiedClaims > 0) return { statusLabel: "Mixed", statusTone: "mixed" };
  return { statusLabel: "Needs verification", statusTone: "review" };
}

export function buildSocialImageViewModel(bundle: RegistryDocumentBundle, locale: string): SocialImageViewModel {
  const safeLocale = isValidLocale(locale) ? locale : DEFAULT_LOCALE;
  return {
    locale: safeLocale,
    headline: getSocialImageHeadline(bundle, safeLocale),
    sourceCount: getSocialImageSourceCount(bundle),
    ...mapSocialImageStatus(bundle),
    eyebrow: "AI-citable claim registry",
    direction: safeLocale === "ar" ? "rtl" : "ltr",
  };
}

const toneColors: Record<SocialImageViewModel["statusTone"], { bg: string; fg: string; border: string }> = {
  ready: { bg: "#dcfce7", fg: "#166534", border: "#86efac" },
  mixed: { bg: "#fef9c3", fg: "#854d0e", border: "#fde047" },
  review: { bg: "#fee2e2", fg: "#991b1b", border: "#fecaca" },
  stale: { bg: "#ffedd5", fg: "#9a3412", border: "#fed7aa" },
};

export function renderSocialImage(vm: SocialImageViewModel, kind: SocialImageKind = "opengraph") {
  const tone = toneColors[vm.statusTone];
  // ImageResponse may not have fonts for every script in local/edge runtimes;
  // use an explicit English fallback instead of rendering tofu or throwing.
  const title = /^[\u0000-\u00ff]*$/.test(vm.headline) ? vm.headline : FALLBACK_HEADLINE;

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
        fontFamily: "Inter, Arial, sans-serif",
        direction: vm.direction,
      },
    },
    React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 24 } },
      React.createElement("div", { style: { fontSize: 34, fontWeight: 800, letterSpacing: -1 } }, "For-Ai"),
      React.createElement("div", { style: { fontSize: 22, opacity: 0.84 } }, kind === "twitter" ? "Twitter/X summary image" : "Open Graph image"),
    ),
    React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 26 } },
      React.createElement("div", { style: { fontSize: 24, textTransform: "uppercase", letterSpacing: 3, opacity: 0.78 } }, vm.eyebrow),
      React.createElement("div", { style: { fontSize: 70, lineHeight: 1.05, fontWeight: 900, letterSpacing: -2, maxWidth: 980 } }, title),
    ),
    React.createElement("div", { style: { display: "flex", gap: 18, alignItems: "center", fontSize: 26 } },
      React.createElement("div", { style: { padding: "14px 22px", borderRadius: 999, background: tone.bg, color: tone.fg, border: `2px solid ${tone.border}`, fontWeight: 800 } }, vm.statusLabel),
      React.createElement("div", { style: { padding: "14px 22px", borderRadius: 999, background: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.28)" } }, `${vm.sourceCount} sources`),
      React.createElement("div", { style: { marginInlineStart: "auto", opacity: 0.82 } }, "for-ai.org"),
    ),
  );
}
