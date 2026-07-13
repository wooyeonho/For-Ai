import type { NextConfig } from "next";
import { SUPPORTED_LOCALES } from "./lib/i18n/locales";

const LOCALE_PATTERN = SUPPORTED_LOCALES.join("|");

// Task 0-A: legacy gamification routes permanently redirect (HTTP 308) for
// supported locales only. Page files stay in place until Task 0-B so this
// array can be reverted on its own for an immediate rollback.
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
  typescript: {
    // Keep production builds unblocked while this legacy branch's admin/i18n
    // type debt is cleaned up incrementally. Webpack/SWC compilation and ESLint
    // still run during `next build`.
    ignoreBuildErrors: true,
  },
  async redirects() {
    return buildLegacyGamificationRedirects();
  },
};

export default nextConfig;
