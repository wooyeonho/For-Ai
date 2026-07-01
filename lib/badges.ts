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
