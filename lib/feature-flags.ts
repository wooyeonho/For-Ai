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

// Bible v7 Task 1 section 6.9: the Check feature is only shown in public nav once a
// production-ready rate-limit backend is confirmed available for it. This
// flag is the operator's explicit go/no-go switch for that; the route itself
// stays reachable by direct URL either way (it has its own distributed
// rate limiter — see lib/rate-limit-store.ts — regardless of this flag).
export function checkAnswerPublicNavEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_CHECK === "true";
}
