import { NextResponse } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '../../../../lib/supabase-server';
import { buildLeaderboardRows } from '../../../../lib/gamification-leaderboard';

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

  // Aggregate points per contributor, but only count quality events.
  // Excluded: submission-time events such as topic_submitted, source_submitted,
  // and legacy official_source_bonus. Only acceptance-based events count.
  const sorted = buildLeaderboardRows(events ?? []);

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
