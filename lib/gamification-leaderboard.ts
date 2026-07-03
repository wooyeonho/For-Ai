export const LEADERBOARD_QUALITY_EVENTS = new Set([
  'source_accepted',
  'official_source_accepted_bonus',
  'source_used_in_verified_claim',
  'hallucination_accepted',
  'stale_claim_fixed',
  'topic_accepted',
  'new_country_contribution',
]);

export type LeaderboardPointEvent = {
  contributor_hash: string;
  points: number;
  event_type: string;
};

export type LeaderboardRow = {
  rank: number;
  contributor_hash: string;
  quality_points: number;
};

export function buildLeaderboardRows(events: LeaderboardPointEvent[], limit = 50): LeaderboardRow[] {
  const scoreMap = new Map<string, number>();
  for (const e of events) {
    if (!LEADERBOARD_QUALITY_EVENTS.has(e.event_type)) continue;
    scoreMap.set(e.contributor_hash, (scoreMap.get(e.contributor_hash) ?? 0) + e.points);
  }

  return Array.from(scoreMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([contributor_hash, quality_points], i) => ({
      rank: i + 1,
      contributor_hash,
      quality_points,
    }));
}
