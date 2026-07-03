import type { Metadata } from 'next';
import Link from 'next/link';
import { LeaderboardClient } from './LeaderboardClient';
import { getPublicBaseUrl } from '@/lib/public-base-url';

export const metadata: Metadata = {
  title: 'Contributor Leaderboard — For-Ai',
  description: 'Top contributors ranked by accepted source submissions and quality fact-verification work.',
};

export const revalidate = 300;

type LeaderboardEntry = {
  rank: number;
  contributor_hash: string;
  quality_points: number;
  badge_count: number;
};

async function fetchLeaderboard(period: string): Promise<LeaderboardEntry[]> {
  const base = getPublicBaseUrl();
  try {
    const res = await fetch(`${base}/api/gamification/leaderboard?period=${period}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.leaderboard ?? [];
  } catch {
    return [];
  }
}

export default async function LeaderboardPage() {
  const weekly = await fetchLeaderboard('week');

  return (
    <main className="page-main">
      <div className="page-container">
        <div className="page-breadcrumb">
          <Link href="/contribute">Contribute</Link>
          <span> / </span>
          <span>Leaderboard</span>
        </div>

        <h1>Contributor Leaderboard</h1>
        <p className="page-desc">
          Ranked by <strong>accepted contributions only</strong> — source_accepted, source_used_in_verified_claim, hallucination_accepted, and stale_claim_fixed events.
          Submission count alone does not affect rank.
        </p>

        <div className="leaderboard-notice">
          Leaderboard resets weekly. All-time and monthly views available below.
        </div>

        <LeaderboardClient initialWeekly={weekly} />
      </div>
    </main>
  );
}
