import { NextResponse } from "next/server";
import { createServiceRoleClient, isServiceRoleConfigured } from "../../../../lib/supabase-server";
import { makeContributorHashForRequest } from "../../../../lib/contributor-hash";
import { rateLimited } from "../../../../lib/rate-limit";
import { calculateContributorStreaks, type ContributionEvent } from "../../../../lib/contributor-streaks";

const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;
const EVENT_LIMIT = 2000;

export type ContributorStreakResponse = {
  streak: { currentDays: number; longestDays: number; activeOn: string | null } | null;
};

// contributor_hash is derived deterministically from the requester's own IP
// (see lib/contributor-hash.ts), so this route only ever returns the
// caller's own accepted_contribution streak. contribution_events has no
// public RLS SELECT policy (service-role only), so this route fails closed
// to { streak: null } whenever the service role key isn't configured rather
// than falling back to the anon key.
export async function GET(request: Request) {
  if (!isServiceRoleConfigured()) {
    return NextResponse.json<ContributorStreakResponse>({ streak: null }, { headers: { "Cache-Control": "no-store" } });
  }

  let contributorHash: string;
  try {
    contributorHash = makeContributorHashForRequest(request);
  } catch (error) {
    console.error("[contributions/streak] Contributor salt missing:", error);
    return NextResponse.json<ContributorStreakResponse>({ streak: null }, { headers: { "Cache-Control": "no-store" } });
  }

  if (rateLimited("contributions-streak", contributorHash, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Cache-Control": "no-store" } });
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json<ContributorStreakResponse>({ streak: null }, { headers: { "Cache-Control": "no-store" } });
  }

  let data: { created_at: string }[] | null;
  try {
    // Most-recent-first + limit: currentDays/activeOn are anchored on "today",
    // so a contributor with more than EVENT_LIMIT lifetime events must keep
    // their newest rows, not their oldest (ascending order silently drops
    // recent activity once the cap is hit).
    const result = await supabase
      .from("contribution_events")
      .select("created_at")
      .eq("contributor_hash", contributorHash)
      .eq("event_type", "accepted_contribution")
      .order("created_at", { ascending: false })
      .limit(EVENT_LIMIT);
    if (result.error) throw result.error;
    data = result.data;
  } catch (error) {
    console.error("[contributions/streak] Query failed:", error);
    return NextResponse.json<ContributorStreakResponse>({ streak: null }, { headers: { "Cache-Control": "no-store" } });
  }

  const events: ContributionEvent[] = (data ?? []).map((row) => ({
    contributor_hash: contributorHash,
    event_type: "accepted_contribution",
    created_at: row.created_at,
  }));

  const summary = calculateContributorStreaks(contributorHash, events);
  const streak = summary.streaks.accepted_contribution;

  return NextResponse.json<ContributorStreakResponse>(
    {
      streak:
        streak.longestDays > 0
          ? { currentDays: streak.currentDays, longestDays: streak.longestDays, activeOn: streak.activeOn }
          : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
