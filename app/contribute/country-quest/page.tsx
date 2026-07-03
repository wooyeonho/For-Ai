import type { Metadata } from 'next';
import Link from 'next/link';
import { getPublicBaseUrl } from '@/lib/public-base-url';

export const metadata: Metadata = {
  title: 'Country Quests — For-Ai',
  description: 'Help verify facts for countries around the world. Track progress toward 100 verified facts per country.',
};

export const revalidate = 600;

type CountryQuest = {
  country: string;
  verified_count: number;
  total_count: number;
  target_count: number;
  progress_pct: number;
};

async function fetchQuests(): Promise<CountryQuest[]> {
  const base = getPublicBaseUrl();
  try {
    const res = await fetch(`${base}/api/gamification/country-quest`, {
      next: { revalidate: 600 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.quests ?? [];
  } catch {
    return [];
  }
}

export default async function CountryQuestPage() {
  const quests = await fetchQuests();

  const completed = quests.filter((q) => q.progress_pct >= 100);
  const inProgress = quests.filter((q) => q.progress_pct < 100 && q.verified_count > 0);
  const notStarted = quests.filter((q) => q.verified_count === 0);

  return (
    <main className="page-main">
      <div className="page-container">
        <div className="page-breadcrumb">
          <Link href="/contribute">Contribute</Link>
          <span> / </span>
          <span>Country Quests</span>
        </div>

        <h1>Country Quests</h1>
        <p className="page-desc">
          Each country has a goal of 100 verified facts. Help reach the target by submitting official sources for claims in that country.
          First contribution to a new country earns a +50 bonus.
        </p>

        <div className="quest-stats-bar">
          <div className="quest-stat">
            <span className="quest-stat-value">{quests.length}</span>
            <span className="quest-stat-label">Countries tracked</span>
          </div>
          <div className="quest-stat">
            <span className="quest-stat-value">{completed.length}</span>
            <span className="quest-stat-label">Completed</span>
          </div>
          <div className="quest-stat">
            <span className="quest-stat-value">{inProgress.length}</span>
            <span className="quest-stat-label">In progress</span>
          </div>
          <div className="quest-stat">
            <span className="quest-stat-value">{quests.reduce((s, q) => s + q.verified_count, 0)}</span>
            <span className="quest-stat-label">Total verified facts</span>
          </div>
        </div>

        {inProgress.length > 0 && (
          <section className="quest-section">
            <h2>In Progress</h2>
            <div className="country-quest-grid-full">
              {inProgress.map((q) => <QuestCard key={q.country} quest={q} />)}
            </div>
          </section>
        )}

        {notStarted.length > 0 && (
          <section className="quest-section">
            <h2>Needs Contributors</h2>
            <p className="section-desc">These countries have no verified facts yet. Be the first to contribute.</p>
            <div className="country-quest-grid-full">
              {notStarted.map((q) => <QuestCard key={q.country} quest={q} />)}
            </div>
          </section>
        )}

        {completed.length > 0 && (
          <section className="quest-section">
            <h2>Completed</h2>
            <div className="country-quest-grid-full">
              {completed.map((q) => <QuestCard key={q.country} quest={q} />)}
            </div>
          </section>
        )}

        {quests.length === 0 && (
          <p className="empty-state">Country quest data is not available yet. Check back soon.</p>
        )}
      </div>
    </main>
  );
}

function QuestCard({ quest }: { quest: CountryQuest }) {
  const pct = Math.min(quest.progress_pct, 100);
  return (
    <div className="country-quest-card-full">
      <div className="cq-header">
        <span className="cq-country">{quest.country}</span>
        <span className="cq-count">{quest.verified_count} / {quest.target_count} verified</span>
      </div>
      <div className="cq-bar-wrap">
        <div className="cq-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="cq-footer">
        <span className="cq-pct">{pct}%</span>
        {quest.total_count > 0 && (
          <span className="cq-total">{quest.total_count} total facts</span>
        )}
      </div>
    </div>
  );
}
