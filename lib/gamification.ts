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

export interface Badge {
  slug: string;
  name: string;
  description: string;
  icon: string;  // two-letter abbreviation for display
}

export const BADGES: Record<string, Badge> = {
  first_source: {
    slug: 'first_source',
    name: 'First Source',
    description: 'Submitted your first source candidate',
    icon: '1S',
  },
  source_finder: {
    slug: 'source_finder',
    name: 'Source Finder',
    description: 'Submitted 10 source candidates',
    icon: 'SF',
  },
  official_source_hunter: {
    slug: 'official_source_hunter',
    name: 'Official Source Hunter',
    description: '10 official-domain sources accepted',
    icon: 'OS',
  },
  country_scout: {
    slug: 'country_scout',
    name: 'Country Scout',
    description: 'Contributed sources for 20 claims in one country',
    icon: 'CS',
  },
  global_contributor: {
    slug: 'global_contributor',
    name: 'Global Contributor',
    description: 'Contributed to 5 or more countries',
    icon: 'GC',
  },
  hallucination_spotter: {
    slug: 'hallucination_spotter',
    name: 'Hallucination Spotter',
    description: '10 AI hallucination reports accepted',
    icon: 'HS',
  },
  stale_fixer: {
    slug: 'stale_fixer',
    name: 'Stale Fixer',
    description: 'Fixed 10 stale claim sources',
    icon: 'SX',
  },
  high_trust: {
    slug: 'high_trust',
    name: 'High Trust Contributor',
    description: '80%+ source acceptance rate (minimum 10 submissions)',
    icon: 'HT',
  },
};

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
): Promise<void> {
  await sb.from('contributor_point_events').insert({
    contributor_hash: contributorHash,
    event_type: eventType,
    points,
    reference_id: opts?.referenceId ?? null,
    reference_type: opts?.referenceType ?? null,
    metadata: opts?.metadata ?? {},
  });
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
