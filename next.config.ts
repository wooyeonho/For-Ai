import type { NextConfig } from "next";
import { SUPPORTED_LOCALES } from "./lib/i18n/locales";

const LOCALE_PATTERN = SUPPORTED_LOCALES.join("|");
const SOCIAL_IMAGE_FONT_FILES = [
  "./node_modules/@fontsource/nanum-gothic/files/nanum-gothic-latin-400-normal.woff",
  "./assets/fonts/nanum-gothic-for-ai-hangul.woff",
  "./assets/fonts/nanum-gothic-for-ai-hangul.glyphs.txt",
];

// Task 0-A: legacy gamification routes permanently redirect (HTTP 308) for
// supported locales only. As of Task 0-B, the source page files
// (app/[locale]/{quests,missions,bounties,challenges,campaigns}) no longer
// exist, so reverting this array alone is not a full rollback — restoring
// those directories from git history is also required.
export const LEGACY_GAMIFICATION_REDIRECTS = [
  { from: "quests", to: "contributors" },
  { from: "missions", to: "contributors" },
  { from: "bounties", to: "leaderboard" },
  { from: "challenges", to: "leaderboard" },
  { from: "campaigns", to: "" },
] as const;

export function buildLegacyGamificationRedirects() {
  return LEGACY_GAMIFICATION_REDIRECTS.map(({ from, to }) => ({
    source: `/:locale(${LOCALE_PATTERN})/${from}/:path*`,
    destination: to ? `/:locale/${to}` : "/:locale",
    permanent: true,
  }));
}

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/**/opengraph-image": SOCIAL_IMAGE_FONT_FILES,
    "/**/twitter-image": SOCIAL_IMAGE_FONT_FILES,
  },
  async headers() {
    return [
      {
        source: "/embed/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
  async redirects() {
    return buildLegacyGamificationRedirects();
  },
};

export default nextConfig;
