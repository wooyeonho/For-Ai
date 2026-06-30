import { NextResponse } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '../../../../../lib/supabase-server';
import { getContributorStats, BADGES } from '../../../../../lib/gamification';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ hash: string }> }
) {
  const { hash } = await params;

  if (!hash || hash.length < 8) {
    return NextResponse.json({ error: 'Invalid contributor hash' }, { status: 400 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ total_points: 0, events: [], badges: [], rank_this_week: null });
  }

  const sb = createServerClient();
  const stats = await getContributorStats(sb, hash);

  // Enrich badges with display info
  const enrichedBadges = stats.badges.map((b) => ({
    ...b,
    ...BADGES[b.badge_slug],
  }));

  return NextResponse.json({ ...stats, badges: enrichedBadges });
}
