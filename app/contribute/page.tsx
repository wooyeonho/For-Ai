import type { Metadata } from 'next';
import Link from 'next/link';
import { ContributeClient } from './ContributeClient';

export const metadata: Metadata = {
  title: 'Contribute — For-Ai Fact Registry',
  description: 'Help verify facts worldwide. Submit official sources, report AI hallucinations, and earn points for quality contributions.',
};

export const revalidate = 120;

type Bounty = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  country: string | null;
  points_reward: number;
  is_sponsored: boolean;
  sponsored_by: string | null;
  expires_at: string | null;
  created_at: string;
};

type LeaderboardEntry = {
  rank: number;
  contributor_hash: string;
  quality_points: number;
  badge_count: number;
};

type CountryQuest = {
  country: string;
  verified_count: number;
  total_count: number;
  target_count: number;
  progress_pct: number;
};

async function fetchBounties(): Promise<Bounty[]> {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  try {
    const res = await fetch(`${base}/api/gamification/bounties?status=open&limit=8`, {
      next: { revalidate: 120 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.bounties ?? [];
  } catch {
    return [];
  }
}

async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  try {
    const res = await fetch(`${base}/api/gamification/leaderboard?period=week`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.leaderboard ?? []).slice(0, 10);
  } catch {
    return [];
  }
}

async function fetchCountryQuests(): Promise<CountryQuest[]> {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  try {
    const res = await fetch(`${base}/api/gamification/country-quest`, {
      next: { revalidate: 600 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.quests ?? []).slice(0, 12);
  } catch {
    return [];
  }
}

export default async function ContributePage() {
  const [bounties, leaderboard, countryQuests] = await Promise.all([
    fetchBounties(),
    fetchLeaderboard(),
    fetchCountryQuests(),
  ]);

  return (
    <main className="page-main">
      <div className="page-container">
        <div className="contribute-hero">
          <h1>Contribute to For-Ai</h1>
          <p className="contribute-tagline">
            Help verify facts for AI. Find official sources, report AI hallucinations, and earn points for quality contributions.
          </p>
          <div className="contribute-hero-actions">
            <Link href="/suggest-topic" className="btn-primary">Suggest a Topic</Link>
            <Link href="/contribute/leaderboard" className="btn-secondary">View Leaderboard</Link>
            <Link href="/contribute/country-quest" className="btn-secondary">Country Quests</Link>
          </div>
        </div>

        {/* Point system overview */}
        <section className="contribute-section">
          <h2>How Points Work</h2>
          <p className="section-desc">Points are awarded for accepted contributions — not just submissions. Quality matters.</p>
          <div className="point-table-wrap">
            <table className="point-table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Points</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>Submit a source candidate</td><td>+5</td></tr>
                <tr><td>Submit an official-domain source</td><td>+10</td></tr>
                <tr><td>Source accepted by admin</td><td>+30</td></tr>
                <tr><td>Source used in verified claim</td><td>+100</td></tr>
                <tr><td>Report an AI hallucination</td><td>+5</td></tr>
                <tr><td>Hallucination report accepted</td><td>+50</td></tr>
                <tr><td>Suggest a new topic (accepted)</td><td>+20</td></tr>
                <tr><td>First contribution to a new country</td><td>+50 bonus</td></tr>
                <tr><td>Fix a stale claim source</td><td>+80</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <div className="contribute-grid">
          {/* Bounties */}
          <section className="contribute-section">
            <div className="section-header">
              <h2>Open Bounties</h2>
              <Link href="/contribute/leaderboard" className="section-link">All bounties</Link>
            </div>
            <p className="section-desc">Claims that need official sources. Submit the right source to earn bonus points.</p>
            {bounties.length === 0 ? (
              <p className="empty-state">No open bounties at the moment. Check back soon.</p>
            ) : (
              <div className="bounty-list">
                {bounties.map((b) => (
                  <div key={b.id} className="bounty-card">
                    <div className="bounty-card-top">
                      <span className="bounty-reward">+{b.points_reward} pts</span>
                      <span className="bounty-category">{b.category}</span>
                      {b.country && <span className="bounty-country">{b.country}</span>}
                      {b.is_sponsored && <span className="bounty-sponsored">Sponsored</span>}
                    </div>
                    <p className="bounty-title">{b.title}</p>
                    {b.description && <p className="bounty-desc">{b.description}</p>}
                    {b.sponsored_by && (
                      <p className="bounty-sponsor-label">Sponsored by {b.sponsored_by}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* This week leaderboard */}
          <section className="contribute-section">
            <div className="section-header">
              <h2>This Week&apos;s Leaders</h2>
              <Link href="/contribute/leaderboard" className="section-link">Full leaderboard</Link>
            </div>
            <p className="section-desc">Ranked by accepted contributions only. Submission count does not count.</p>
            {leaderboard.length === 0 ? (
              <p className="empty-state">No contributions yet this week. Be the first.</p>
            ) : (
              <table className="leaderboard-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Contributor</th>
                    <th>Points</th>
                    <th>Badges</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((entry) => (
                    <tr key={entry.contributor_hash}>
                      <td className="rank-cell">{entry.rank}</td>
                      <td className="hash-cell">{entry.contributor_hash}</td>
                      <td className="points-cell">{entry.quality_points}</td>
                      <td className="badge-count-cell">{entry.badge_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>

        {/* Country Quest */}
        <section className="contribute-section">
          <div className="section-header">
            <h2>Country Quests</h2>
            <Link href="/contribute/country-quest" className="section-link">View all countries</Link>
          </div>
          <p className="section-desc">Help verify facts for underrepresented countries. Each country has a progress bar toward 100 verified facts.</p>
          {countryQuests.length === 0 ? (
            <p className="empty-state">Country quest data is loading.</p>
          ) : (
            <div className="country-quest-grid">
              {countryQuests.map((q) => (
                <div key={q.country} className="country-quest-card">
                  <div className="cq-header">
                    <span className="cq-country">{q.country}</span>
                    <span className="cq-count">{q.verified_count} / {q.target_count}</span>
                  </div>
                  <div className="cq-bar-wrap">
                    <div
                      className="cq-bar-fill"
                      style={{ width: `${Math.min(q.progress_pct, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Badges */}
        <section className="contribute-section">
          <h2>Badges</h2>
          <p className="section-desc">Earn badges by making consistent, quality contributions.</p>
          <div className="badge-grid">
            {[
              { icon: '1S', name: 'First Source', desc: 'Submit your first source candidate' },
              { icon: 'SF', name: 'Source Finder', desc: 'Submit 10 source candidates' },
              { icon: 'OS', name: 'Official Source Hunter', desc: '10 official-domain sources accepted' },
              { icon: 'CS', name: 'Country Scout', desc: 'Contribute to 20 facts in one country' },
              { icon: 'GC', name: 'Global Contributor', desc: 'Contribute to 5 or more countries' },
              { icon: 'HS', name: 'Hallucination Spotter', desc: '10 AI hallucination reports accepted' },
              { icon: 'SX', name: 'Stale Fixer', desc: 'Fix 10 stale claim sources' },
              { icon: 'HT', name: 'High Trust Contributor', desc: '80%+ source acceptance rate (min 10 submissions)' },
            ].map((badge) => (
              <div key={badge.icon} className="badge-card">
                <div className="badge-icon">{badge.icon}</div>
                <div className="badge-info">
                  <p className="badge-name">{badge.name}</p>
                  <p className="badge-desc">{badge.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Source submission CTA */}
        <section className="contribute-section contribute-cta-section">
          <h2>Ready to Contribute?</h2>
          <p>Find a claim that needs a source and submit the official URL. Every accepted source makes AI more accurate.</p>
          <div className="contribute-cta-actions">
            <Link href="/suggest-topic" className="btn-primary">Suggest a New Topic</Link>
            <Link href="/community" className="btn-secondary">Community</Link>
          </div>
          <ContributeClient />
        </section>
      </div>
    </main>
  );
}
