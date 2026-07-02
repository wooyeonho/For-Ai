import { SupabaseClient } from '@supabase/supabase-js';

export const POINT_VALUES = {
  topic_submitted: 2,
  topic_accepted: 20,
  source_submitted: 5,
  official_source_bonus: 5,       // stacked on top of source_submitted for official domains
  source_accepted: 30,
  source_used_in_verified_claim: 100,
  hallucination_reported: 5,
  hallucination_accepted: 50,
  new_country_contribution: 50,   // first contribution to a previously untouched country
  stale_claim_fixed: 80,
} as const;

import { BADGES } from "./badges";
export { BADGES };
export type { Badge } from "./badges";

export async function awardPoints(
  sb: SupabaseClient,
  contributorHash: string,
  eventType: string,
  points: number,
  opts?: {
    referenceId?: string;
    referenceType?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<boolean> {
  const event = {
    contributor_hash: contributorHash,
    event_type: eventType,
    points,
    reference_id: opts?.referenceId ?? null,
    reference_type: opts?.referenceType ?? null,
    metadata: opts?.metadata ?? {},
  };

  // Award rows that are tied to a reviewed/submitted object must be idempotent.
  // The database migration adds a matching partial unique index so concurrent
  // retries cannot mint the same reward more than once.
  const query = opts?.referenceId && opts?.referenceType
    ? sb
        .from('contributor_point_events')
        .upsert(event, {
          onConflict: 'contributor_hash,event_type,reference_type,reference_id',
          ignoreDuplicates: true,
        })
        .select('id')
        .maybeSingle()
    : sb.from('contributor_point_events').insert(event).select('id').maybeSingle();

  const { data, error } = await query;
  if (error) throw new Error(`point award failed: ${error.message}`);
  return Boolean(data);
}

export async function awardBadgeIfNew(
  sb: SupabaseClient,
  contributorHash: string,
  badgeSlug: string
): Promise<boolean> {
  const { error } = await sb.from('contributor_badges').insert({
    contributor_hash: contributorHash,
    badge_slug: badgeSlug,
  });
  // UNIQUE constraint violation = already has it → return false
  return !error;
}

export async function checkAndAwardBadges(
  sb: SupabaseClient,
  contributorHash: string
): Promise<string[]> {
  const awarded: string[] = [];

  const [{ data: events }, { data: existingBadges }] = await Promise.all([
    sb
      .from('contributor_point_events')
      .select('event_type, metadata')
      .eq('contributor_hash', contributorHash),
    sb
      .from('contributor_badges')
      .select('badge_slug')
      .eq('contributor_hash', contributorHash),
  ]);

  if (!events) return awarded;

  const hasBadge = new Set((existingBadges ?? []).map((b) => b.badge_slug));

  const counts = events.reduce((acc, e) => {
    acc[e.event_type] = (acc[e.event_type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const countriesContributed = new Set(
    events
      .filter((e) => (e.metadata as Record<string, unknown>)?.country)
      .map((e) => String((e.metadata as Record<string, unknown>).country))
  );

  const checks: Array<{ slug: string; condition: boolean }> = [
    { slug: 'first_source', condition: (counts['source_submitted'] ?? 0) >= 1 },
    { slug: 'source_finder', condition: (counts['source_submitted'] ?? 0) >= 10 },
    {
      slug: 'official_source_hunter',
      condition: (counts['official_source_bonus'] ?? 0) >= 10,
    },
    { slug: 'hallucination_spotter', condition: (counts['hallucination_accepted'] ?? 0) >= 10 },
    { slug: 'stale_fixer', condition: (counts['stale_claim_fixed'] ?? 0) >= 10 },
    { slug: 'global_contributor', condition: countriesContributed.size >= 5 },
  ];

  for (const { slug, condition } of checks) {
    if (!hasBadge.has(slug) && condition) {
      if (await awardBadgeIfNew(sb, contributorHash, slug)) {
        awarded.push(slug);
        hasBadge.add(slug);
      }
    }
  }

  return awarded;
}

export function isOfficialDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return (
      /\.gov$/.test(hostname) ||
      /\.gov\./.test(hostname) ||
      /\.go\./.test(hostname) ||
      /\.gob\./.test(hostname) ||
      /\.gc\.ca$/.test(hostname) ||
      /\.europa\.eu$/.test(hostname) ||
      /\.un\.org$/.test(hostname) ||
      /\.int$/.test(hostname)
    );
  } catch {
    return false;
  }
}

export function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export async function getContributorStats(
  sb: SupabaseClient,
  contributorHash: string
): Promise<{
  total_points: number;
  rank_this_week: number | null;
  events: Array<{ event_type: string; points: number; created_at: string }>;
  badges: Array<{ badge_slug: string; awarded_at: string }>;
}> {
  const [{ data: events }, { data: badges }] = await Promise.all([
    sb
      .from('contributor_point_events')
      .select('event_type, points, created_at')
      .eq('contributor_hash', contributorHash)
      .order('created_at', { ascending: false })
      .limit(50),
    sb
      .from('contributor_badges')
      .select('badge_slug, awarded_at')
      .eq('contributor_hash', contributorHash),
  ]);

  const total_points = (events ?? []).reduce((sum, e) => sum + e.points, 0);

  return {
    total_points,
    rank_this_week: null,
    events: events ?? [],
    badges: badges ?? [],
  };
}

export type ContributorBadgeMetric =
  | "submitted_source_count"
  | "accepted_source_count"
  | "verified_claim_contribution_count"
  | "country_coverage_count"
  | "category_contribution_count"
  | "stale_claim_fix_count"
  | "hallucination_report_accepted_count";

export type ContributorBadgeTier = "bronze" | "silver" | "gold";

export type ContributorGamificationStats = Record<ContributorBadgeMetric, number>;

export type ContributorBadgeDefinition = {
  id: string;
  label: string;
  description: string;
  metric: ContributorBadgeMetric;
  threshold: number;
  tier: ContributorBadgeTier;
};

export type ContributorBadge = ContributorBadgeDefinition & {
  currentValue: number;
  earned: boolean;
};

export const emptyContributorGamificationStats: ContributorGamificationStats = {
  submitted_source_count: 0,
  accepted_source_count: 0,
  verified_claim_contribution_count: 0,
  country_coverage_count: 0,
  category_contribution_count: 0,
  stale_claim_fix_count: 0,
  hallucination_report_accepted_count: 0,
};

export const contributorBadgeDefinitions: ContributorBadgeDefinition[] = [
  {
    id: "source-scout-bronze",
    label: "Source Scout",
    description: "Submitted at least 3 traceable sources for claim review.",
    metric: "submitted_source_count",
    threshold: 3,
    tier: "bronze",
  },
  {
    id: "source-scout-silver",
    label: "Source Scout+",
    description: "Submitted at least 15 traceable sources for claim review.",
    metric: "submitted_source_count",
    threshold: 15,
    tier: "silver",
  },
  {
    id: "accepted-evidence-bronze",
    label: "Accepted Evidence",
    description: "Had at least 2 submitted sources accepted by reviewers.",
    metric: "accepted_source_count",
    threshold: 2,
    tier: "bronze",
  },
  {
    id: "accepted-evidence-gold",
    label: "Accepted Evidence Pro",
    description: "Had at least 25 submitted sources accepted by reviewers.",
    metric: "accepted_source_count",
    threshold: 25,
    tier: "gold",
  },
  {
    id: "verified-claim-helper-bronze",
    label: "Verified Claim Helper",
    description: "Contributed to at least 1 claim that became verified.",
    metric: "verified_claim_contribution_count",
    threshold: 1,
    tier: "bronze",
  },
  {
    id: "verified-claim-helper-silver",
    label: "Verified Claim Helper+",
    description: "Contributed to at least 10 claims that became verified.",
    metric: "verified_claim_contribution_count",
    threshold: 10,
    tier: "silver",
  },
  {
    id: "global-coverage-bronze",
    label: "Global Coverage",
    description: "Contributed accepted evidence across at least 2 countries.",
    metric: "country_coverage_count",
    threshold: 2,
    tier: "bronze",
  },
  {
    id: "category-builder-bronze",
    label: "Category Builder",
    description: "Contributed accepted evidence across at least 3 categories.",
    metric: "category_contribution_count",
    threshold: 3,
    tier: "bronze",
  },
  {
    id: "freshness-fixer-bronze",
    label: "Freshness Fixer",
    description: "Fixed at least 1 stale claim with accepted updated evidence.",
    metric: "stale_claim_fix_count",
    threshold: 1,
    tier: "bronze",
  },
  {
    id: "hallucination-corrector-bronze",
    label: "Hallucination Corrector",
    description: "Had at least 1 hallucination report accepted by reviewers.",
    metric: "hallucination_report_accepted_count",
    threshold: 1,
    tier: "bronze",
  },
];

export const CONTRIBUTOR_BADGE_POLICY_NOTE =
  "Badges are quality reference signals only. They do not grant automatic verified authority, reviewer permissions, or claim verification rights.";

export function calculateContributorBadges(
  stats: Partial<ContributorGamificationStats>,
): ContributorBadge[] {
  const normalized = { ...emptyContributorGamificationStats, ...stats };

  return contributorBadgeDefinitions.map((definition) => {
    const currentValue = normalized[definition.metric];

    return {
      ...definition,
      currentValue,
      earned: currentValue >= definition.threshold,
    };
  });
}

import { getAllRegistryBundles } from "./data";
import { getCoverageMetrics, getQuestMetricHints } from "./goal-metrics";

export type DailyMissionType =
  | "submit_official_source"
  | "report_ai_hallucination"
  | "suggest_missing_fact"
  | "fix_stale_claim"
  | "contribute_country_quest"
  | "contribute_category_quest";

export type MissionCompletionBasis = "submission" | "approval" | "rejected";

export type DailyMissionReward = {
  submissionPoints: number;
  approvalPoints: number;
  rejectedPoints: 0;
  rule: string;
};

export type DailyMission = {
  id: string;
  type: DailyMissionType;
  title: string;
  description: string;
  targetLabel: string;
  actionHref: string;
  submissionCompletion: string;
  approvalCompletion: string;
  antiAbuseRule: string;
  reward: DailyMissionReward;
};

export type DailyMissionPlan = {
  date: string;
  generatedAt: string;
  missions: DailyMission[];
  rewardPolicy: {
    submission: string;
    approval: string;
    rejected: string;
  };
};

const MISSION_REWARDS: Record<DailyMissionType, Omit<DailyMissionReward, "rejectedPoints" | "rule">> = {
  submit_official_source: { submissionPoints: 8, approvalPoints: 32 },
  report_ai_hallucination: { submissionPoints: 6, approvalPoints: 24 },
  suggest_missing_fact: { submissionPoints: 5, approvalPoints: 20 },
  fix_stale_claim: { submissionPoints: 10, approvalPoints: 40 },
  contribute_country_quest: { submissionPoints: 7, approvalPoints: 28 },
  contribute_category_quest: { submissionPoints: 7, approvalPoints: 28 },
};

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function stableIndex(seed: string, modulo: number): number {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return modulo ? hash % modulo : 0;
}

function rewardFor(type: DailyMissionType): DailyMissionReward {
  const reward = MISSION_REWARDS[type];
  return {
    ...reward,
    rejectedPoints: 0,
    rule: "Submission points only acknowledge queue intake; approval points are larger and are awarded only after human/source-backed acceptance. Rejected or spam submissions receive 0 points.",
  };
}

function actionSlug(): string {
  const firstBundle = getAllRegistryBundles()[0];
  return firstBundle?.document.slug ?? "myungdong-laluce-parking";
}

export function getDailyMissionPlan(now: Date = new Date()): DailyMissionPlan {
  const date = isoDate(now);
  const coverage = getCoverageMetrics(now);
  const questHints = getQuestMetricHints();
  const country = questHints.lowestCoverageCountry ?? coverage.documentsByCountry.at(-1)?.key ?? "global";
  const category = questHints.lowestCoverageCategory ?? coverage.documentsByVertical.at(-1)?.key ?? "general";
  const staleTarget = Math.max(1, Math.min(3, coverage.staleClaims || questHints.staleClaims || 1));
  const slug = actionSlug();

  const templates: DailyMission[] = [
    {
      id: `${date}-official-source`,
      type: "submit_official_source",
      title: "Submit an official source",
      description: "Add a traceable primary or official URL that can support one existing needs-review claim.",
      targetLabel: "1 official source URL",
      actionHref: `/${"ko"}/wiki/${slug}#claims`,
      submissionCompletion: "A source candidate is submitted with URL, title/context, and the claim it supports.",
      approvalCompletion: "A reviewer accepts the source into claim_sources and records a verification event.",
      antiAbuseRule: "Duplicate, unrelated, inaccessible, or non-official links are rejected and earn no reward.",
      reward: rewardFor("submit_official_source"),
    },
    {
      id: `${date}-ai-hallucination`,
      type: "report_ai_hallucination",
      title: "Report an AI hallucination",
      description: "Capture one stale, vague, or wrong AI answer so reviewers can convert it into a claim-level correction queue item.",
      targetLabel: "1 wrong AI answer report",
      actionHref: `/hallucination/${slug}`,
      submissionCompletion: "A report is submitted with AI service, prompt/answer evidence, and expected correction.",
      approvalCompletion: "A reviewer accepts the report as actionable and links it to a document, entity, or claim.",
      antiAbuseRule: "Fabricated AI outputs, missing evidence, harassment, or duplicate reports are rejected and earn no reward.",
      reward: rewardFor("report_ai_hallucination"),
    },
    {
      id: `${date}-missing-fact`,
      type: "suggest_missing_fact",
      title: "Suggest a missing fact",
      description: "Propose one globally useful fact AI may cite incorrectly, while keeping it clearly unverified until review.",
      targetLabel: "1 missing claim candidate",
      actionHref: "/suggest-topic",
      submissionCompletion: "A candidate fact is submitted with entity/topic, jurisdiction, and why the fact matters.",
      approvalCompletion: "A reviewer accepts the candidate for the verification queue without marking it verified prematurely.",
      antiAbuseRule: "Guesses, promotional copy, personal data, or unverifiable claims are rejected and earn no reward.",
      reward: rewardFor("suggest_missing_fact"),
    },
    {
      id: `${date}-stale-claim`,
      type: "fix_stale_claim",
      title: "Fix a stale claim",
      description: "Find a claim that needs freshness review and submit current evidence rather than overwriting truth directly.",
      targetLabel: `${staleTarget} stale claim review${staleTarget === 1 ? "" : "s"}`,
      actionHref: `/${"ko"}/wiki/${slug}#claims`,
      submissionCompletion: "A proposed update is submitted for a stale claim with source and observed date.",
      approvalCompletion: "A reviewer updates the claim status/value/confidence and records verification_events.",
      antiAbuseRule: "Unsupported value changes or stale sources are rejected and earn no reward.",
      reward: rewardFor("fix_stale_claim"),
    },
    {
      id: `${date}-country-${country}`,
      type: "contribute_country_quest",
      title: "Contribute to a country quest",
      description: "Improve coverage for a low-coverage jurisdiction without inventing facts about it.",
      targetLabel: country.toUpperCase(),
      actionHref: "/suggest-topic",
      submissionCompletion: "A source, hallucination report, or missing fact candidate is submitted for the target country.",
      approvalCompletion: "A reviewer accepts the contribution into the target country queue or source-backed claim record.",
      antiAbuseRule: "Country tags that do not match the entity/jurisdiction are rejected and earn no reward.",
      reward: rewardFor("contribute_country_quest"),
    },
    {
      id: `${date}-category-${category}`,
      type: "contribute_category_quest",
      title: "Contribute to a category quest",
      description: "Expand one under-covered category with a verifiable source or claim candidate.",
      targetLabel: category,
      actionHref: "/suggest-topic",
      submissionCompletion: "A contribution is submitted for the target category with enough context for review.",
      approvalCompletion: "A reviewer accepts it into the category queue or source-backed claim record.",
      antiAbuseRule: "Misclassified, promotional, or unverifiable category submissions are rejected and earn no reward.",
      reward: rewardFor("contribute_category_quest"),
    },
  ];

  const rotation = stableIndex(date, templates.length);
  const missions = [...templates.slice(rotation), ...templates.slice(0, rotation)];

  return {
    date,
    generatedAt: now.toISOString(),
    missions,
    rewardPolicy: {
      submission: "Submission completion means the item entered a moderation/review queue only; it does not make a fact verified.",
      approval: "Approval completion requires human/source-backed acceptance and always pays more than submission intake.",
      rejected: "Rejected or spam submissions receive 0 points so missions never reward fake facts.",
    },
  };
}

export function getMissionRewardForStatus(
  mission: DailyMission,
  basis: MissionCompletionBasis,
): number {
  if (basis === "submission") return mission.reward.submissionPoints;
  if (basis === "approval") return mission.reward.approvalPoints;
  return mission.reward.rejectedPoints;
}
