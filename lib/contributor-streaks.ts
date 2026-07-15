import type { SubmissionStatus } from "./types";

export type ContributionEventType =
  | "visit"
  | "submission"
  | "accepted_contribution"
  | "verified_source";

export type ContributorStreakType = ContributionEventType;

export type ContributionEvent = {
  contributor_hash: string;
  event_type: ContributionEventType;
  created_at: string | Date;
  submission_status?: SubmissionStatus | "spam_suspected" | null;
};

export type StreakReward = {
  points: number;
  badge: string | null;
  leaderboardEligible: boolean;
};

export type ContributorStreak = {
  type: ContributorStreakType;
  currentDays: number;
  longestDays: number;
  activeOn: string | null;
  reward: StreakReward;
};

export type ContributorStreakSummary = {
  contributor_hash: string;
  streaks: Record<ContributorStreakType, ContributorStreak>;
  totalPoints: number;
  badges: string[];
  leaderboardScore: number;
};

const DAY_MS = 86_400_000;
const STREAK_TYPES: ContributorStreakType[] = ["visit", "submission", "accepted_contribution", "verified_source"];

const POINTS_PER_DAY: Record<ContributorStreakType, number> = {
  visit: 1,
  submission: 5,
  accepted_contribution: 20,
  verified_source: 0,
};

function toUtcDay(input: string | Date): string {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid contribution event date: ${String(input)}`);
  return date.toISOString().slice(0, 10);
}

function shiftUtcDay(day: string, days: number): string {
  const time = new Date(`${day}T00:00:00.000Z`).getTime() + days * DAY_MS;
  return new Date(time).toISOString().slice(0, 10);
}

function isQualifiedEvent(event: ContributionEvent): boolean {
  if (event.event_type === "submission") {
    return event.submission_status !== "rejected" && event.submission_status !== "spam";
  }
  return true;
}

function rewardFor(type: ContributorStreakType, currentDays: number, longestDays: number): StreakReward {
  if (type === "verified_source") {
    return {
      points: 0,
      badge: longestDays >= 7 ? "verified-source-streak-7" : currentDays > 0 ? "verified-source-contributor" : null,
      leaderboardEligible: longestDays > 0,
    };
  }

  return {
    points: currentDays * POINTS_PER_DAY[type],
    badge: null,
    leaderboardEligible: false,
  };
}

function calculateOneStreak(type: ContributorStreakType, days: Set<string>, asOfDay: string): ContributorStreak {
  const sortedDays = [...days].sort();
  let longestDays = 0;
  let run = 0;
  let previous: string | null = null;

  for (const day of sortedDays) {
    run = previous && shiftUtcDay(previous, 1) === day ? run + 1 : 1;
    longestDays = Math.max(longestDays, run);
    previous = day;
  }

  let currentDays = 0;
  let cursor = days.has(asOfDay) ? asOfDay : days.has(shiftUtcDay(asOfDay, -1)) ? shiftUtcDay(asOfDay, -1) : null;
  const activeOn = cursor;
  while (cursor && days.has(cursor)) {
    currentDays += 1;
    cursor = shiftUtcDay(cursor, -1);
  }

  return { type, currentDays, longestDays, activeOn, reward: rewardFor(type, currentDays, longestDays) };
}

export const STREAK_MILESTONES = [3, 7, 30, 100] as const;

export type StreakMilestoneProgress = {
  next: number | null;
  progressPercent: number;
  maxed: boolean;
};

export function streakMilestoneProgress(currentDays: number): StreakMilestoneProgress {
  const next = STREAK_MILESTONES.find((milestone) => milestone > currentDays) ?? null;
  const prev = [...STREAK_MILESTONES].reverse().find((milestone) => milestone <= currentDays) ?? 0;
  const progressPercent = next ? Math.round(((currentDays - prev) / (next - prev)) * 100) : 100;
  return { next, progressPercent, maxed: !next };
}

export function calculateContributorStreaks(
  contributorHash: string,
  events: ContributionEvent[],
  asOf: string | Date = new Date(),
): ContributorStreakSummary {
  const asOfDay = toUtcDay(asOf);
  const daysByType = Object.fromEntries(STREAK_TYPES.map((type) => [type, new Set<string>()])) as Record<ContributorStreakType, Set<string>>;

  for (const event of events) {
    if (event.contributor_hash !== contributorHash || !isQualifiedEvent(event)) continue;
    daysByType[event.event_type].add(toUtcDay(event.created_at));
  }

  const streaks = Object.fromEntries(
    STREAK_TYPES.map((type) => [type, calculateOneStreak(type, daysByType[type], asOfDay)]),
  ) as Record<ContributorStreakType, ContributorStreak>;

  const badges = STREAK_TYPES.map((type) => streaks[type].reward.badge).filter((badge): badge is string => Boolean(badge));
  const totalPoints = STREAK_TYPES.reduce((sum, type) => sum + streaks[type].reward.points, 0);
  const leaderboardScore = streaks.verified_source.longestDays;

  return { contributor_hash: contributorHash, streaks, totalPoints, badges, leaderboardScore };
}
