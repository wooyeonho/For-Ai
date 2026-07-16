import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getRegistryIndex } from "./registry-index";

export type ContributionEventType =
  | "source_submitted"
  | "source_accepted"
  | "claim_verified_from_contribution"
  | "hallucination_report_accepted";

export type ContributionEvent = {
  id: string;
  contributor_hash: string;
  event_type: ContributionEventType;
  points: number;
  country: string | null;
  source_type: string | null;
  claim_id: string | null;
  document_id: string | null;
  created_at: string;
};

export type ContributorSummary = {
  contributor_hash: string;
  total_points: number;
  weekly_accepted: number;
  events: number;
  countries: string[];
  badges: BadgeAward[];
};

export type BadgeAward = { code: string; name: string; description: string; earned: boolean; progress: number; target: number };
export type CountryQuest = { country: string; verified: number; target: number; remaining: number; progress: number };

export const CONTRIBUTION_EVENT_POINTS: Record<ContributionEventType, number> = {
  source_submitted: 1,
  source_accepted: 5,
  claim_verified_from_contribution: 20,
  hallucination_report_accepted: 10,
};

const ACCEPTED_EVENTS = new Set<ContributionEventType>([
  "source_accepted",
  "claim_verified_from_contribution",
  "hallucination_report_accepted",
]);

function configuredClient() {
  // Anon key only: this module must never hold the service-role key
  // (secrets guard). Callers that need privileged access go through
  // lib/supabase-server.ts inside app/api/**/route.ts instead.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function pointsForContributionEvent(eventType: ContributionEventType): number {
  return CONTRIBUTION_EVENT_POINTS[eventType] ?? 0;
}

export async function recordContributionEvent(
  sb: Pick<SupabaseClient, "from">,
  event: Omit<ContributionEvent, "id" | "points" | "created_at"> & { points?: number; created_at?: string },
) {
  if (!event.contributor_hash) return;
  try {
    await sb.from("contribution_events").insert({
      ...event,
      points: event.points ?? pointsForContributionEvent(event.event_type),
      created_at: event.created_at ?? new Date().toISOString(),
    });
  } catch {
    // Contribution rewards are secondary to preserving the intake submission.
  }
}

async function fetchContributionEvents(limit = 500): Promise<ContributionEvent[]> {
  const sb = configuredClient();
  if (!sb) return [];
  try {
    const { data, error } = await sb
      .from("contribution_events")
      .select("id, contributor_hash, event_type, points, country, source_type, claim_id, document_id, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return [];
    return (data ?? []) as ContributionEvent[];
  } catch {
    return [];
  }
}

function badgeAwards(events: ContributionEvent[]): BadgeAward[] {
  const acceptedSources = events.filter((e) => e.event_type === "source_accepted").length;
  const officialSources = events.filter((e) => e.event_type === "source_accepted" && ["official", "law", "regulator"].includes(e.source_type ?? "")).length;
  const countries = new Set(events.filter((e) => ACCEPTED_EVENTS.has(e.event_type)).map((e) => e.country).filter(Boolean)).size;
  const staleFixes = events.filter((e) => e.event_type === "claim_verified_from_contribution").length;
  const accepted = events.filter((e) => ACCEPTED_EVENTS.has(e.event_type)).length;
  return [
    { code: "source_finder", name: "Source Finder", description: "Accepted source contributions", progress: acceptedSources, target: 1 },
    { code: "official_source_hunter", name: "Official Source Hunter", description: "Official, legal, or regulator sources accepted", progress: officialSources, target: 3 },
    { code: "country_scout", name: "Country Scout", description: "Accepted contributions in multiple countries", progress: countries, target: 3 },
    { code: "stale_fixer", name: "Stale Fixer", description: "Claims refreshed or verified from contributions", progress: staleFixes, target: 5 },
    { code: "global_contributor", name: "Global Contributor", description: "Accepted contribution events", progress: accepted, target: 25 },
  ].map((badge) => ({ ...badge, earned: badge.progress >= badge.target }));
}

export function summarizeContributors(events: ContributionEvent[]): ContributorSummary[] {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const grouped = new Map<string, ContributionEvent[]>();
  for (const event of events) {
    const list = grouped.get(event.contributor_hash) ?? [];
    list.push(event);
    grouped.set(event.contributor_hash, list);
  }
  return [...grouped.entries()].map(([contributor_hash, rows]) => ({
    contributor_hash,
    total_points: rows.reduce((sum, e) => sum + (e.points ?? pointsForContributionEvent(e.event_type)), 0),
    weekly_accepted: rows.filter((e) => ACCEPTED_EVENTS.has(e.event_type) && Date.parse(e.created_at) >= weekAgo).length,
    events: rows.length,
    countries: [...new Set(rows.map((e) => e.country).filter(Boolean) as string[])].sort(),
    badges: badgeAwards(rows),
  })).sort((a, b) => b.weekly_accepted - a.weekly_accepted || b.total_points - a.total_points);
}

export async function getLeaderboard() {
  return summarizeContributors(await fetchContributionEvents());
}

export async function getContributionEvents() {
  return fetchContributionEvents();
}

export async function getCountryQuests(target = 10): Promise<CountryQuest[]> {
  const items = await getRegistryIndex({ verification: "all" });
  const countries = new Map<string, number>();
  for (const item of items) countries.set(item.country || "GLOBAL", (countries.get(item.country || "GLOBAL") ?? 0) + item.verified_claims);
  return [...countries.entries()].map(([country, verified]) => ({
    country,
    verified,
    target,
    remaining: Math.max(0, target - verified),
    progress: Math.min(100, Math.round((verified / target) * 100)),
  })).sort((a, b) => b.remaining - a.remaining || a.country.localeCompare(b.country));
}
