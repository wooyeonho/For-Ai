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
    .from('contributor_points')
    .select('contributor_hash, points, reason, created_at');

  if (since) query = query.gte('created_at', since);

  const { data: events, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Aggregate reputation points per contributor. These points are quality and
  // participation signals only; they never determine claim truth or verification.
  const QUALITY_REASONS = new Set([
    'source_accepted',
    'source_used_in_verified_claim',
    'hallucination_accepted',
    'stale_claim_fixed',
    'topic_accepted',
    'new_country_contribution',
  ]);

  const scoreMap = new Map<string, number>();
  for (const e of events ?? []) {
    if (!QUALITY_REASONS.has(e.reason)) continue;
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

  const leaderboard = sorted.map((row) => ({
    ...row,
    badge_count: 0,
  }));

  return NextResponse.json({ leaderboard, period, generated_at: now.toISOString() });
}
