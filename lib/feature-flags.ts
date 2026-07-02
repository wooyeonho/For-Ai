// Central feature flags.
//
// The experimental gamification routes (challenges, bounties, missions, quests,
// leaderboard) and their subpages are not exposed in the primary navigation and
// depend on tables/metrics that are not part of the core citation pipeline. They
// stay disabled by default so their data loaders never run in production (no
// stray queries, no crash surface). Set ENABLE_EXPERIMENTAL_GAMIFICATION=true to
// re-enable them once the backing features are ready.
export function experimentalGamificationEnabled(): boolean {
  return process.env.ENABLE_EXPERIMENTAL_GAMIFICATION === "true";
}
