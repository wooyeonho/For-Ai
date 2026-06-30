import { NextResponse } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '../../../../lib/supabase-server';

export const revalidate = 300; // 5 minutes

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ leaderboard: [], period: 'week' });
  }

  const { searchParams } = new URL(request.url);
  const period = searchParams.get('period') ?? 'week'; // 'week' | 'month' | 'all'

  let since: string | null = null;
  const now = new Date();
  if (period === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    since = d.toISOString();
  } else if (period === 'month') {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 1);
    since = d.toISOString();
  }

  const sb = createServerClient();

  let query = sb
    .from('contributor_point_events')
    .select('contributor_hash, points, event_type');

  if (since) query = query.gte('created_at', since);

  const { data: events, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Aggregate points per contributor, but only count quality events
  // Excluded: topic_submitted (too easy to spam) — only acceptance-based events count
  const QUALITY_EVENTS = new Set([
    'source_accepted',
    'official_source_bonus',
    'source_used_in_verified_claim',
    'hallucination_accepted',
    'stale_claim_fixed',
    'topic_accepted',
    'new_country_contribution',
  ]);

  const scoreMap = new Map<string, number>();
  for (const e of events ?? []) {
    if (!QUALITY_EVENTS.has(e.event_type)) continue;
    scoreMap.set(e.contributor_hash, (scoreMap.get(e.contributor_hash) ?? 0) + e.points);
  }

  // Sort by score, take top 50
  const sorted = Array.from(scoreMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([contributor_hash, quality_points], i) => ({
      rank: i + 1,
      contributor_hash,
      quality_points,
    }));

  // Fetch badge counts for top contributors
  const hashes = sorted.map((r) => r.contributor_hash);
  const badgeCounts = new Map<string, number>();
  if (hashes.length > 0) {
    const { data: badges } = await sb
      .from('contributor_badges')
      .select('contributor_hash')
      .in('contributor_hash', hashes);
    for (const b of badges ?? []) {
      badgeCounts.set(b.contributor_hash, (badgeCounts.get(b.contributor_hash) ?? 0) + 1);
    }
  }

  const leaderboard = sorted.map((row) => ({
    ...row,
    badge_count: badgeCounts.get(row.contributor_hash) ?? 0,
  }));

  return NextResponse.json({ leaderboard, period, generated_at: now.toISOString() });
}
