"use client";

import { useState } from "react";

type LeaderboardEntry = {
  rank: number;
  contributor_hash: string;
  quality_points: number;
  badge_count: number;
};

type Props = {
  initialWeekly: LeaderboardEntry[];
};

const PERIODS = [
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "all", label: "All Time" },
] as const;

type Period = (typeof PERIODS)[number]["key"];

export function LeaderboardClient({ initialWeekly }: Props) {
  const [period, setPeriod] = useState<Period>("week");
  const [data, setData] = useState<Record<Period, LeaderboardEntry[]>>({ week: initialWeekly, month: [], all: [] });
  const [loading, setLoading] = useState(false);

  async function switchPeriod(p: Period) {
    setPeriod(p);
    if (data[p].length > 0) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/gamification/leaderboard?period=${p}`);
      if (res.ok) {
        const json = await res.json();
        setData((prev) => ({ ...prev, [p]: json.leaderboard ?? [] }));
      }
    } finally {
      setLoading(false);
    }
  }

  const entries = data[period];

  return (
    <div className="leaderboard-client">
      <div className="period-tabs">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            className={`period-tab ${period === p.key ? "active" : ""}`}
            onClick={() => switchPeriod(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading && <p className="loading-text">Loading…</p>}

      {!loading && entries.length === 0 && (
        <p className="empty-state">No contributions recorded for this period yet.</p>
      )}

      {!loading && entries.length > 0 && (
        <table className="leaderboard-table-full">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Contributor</th>
              <th>Quality Points</th>
              <th>Badges</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.contributor_hash} className={entry.rank <= 3 ? "top-rank" : ""}>
                <td className="rank-cell">
                  {entry.rank <= 3 ? ["1st", "2nd", "3rd"][entry.rank - 1] : `#${entry.rank}`}
                </td>
                <td className="hash-cell">{entry.contributor_hash}</td>
                <td className="points-cell">{entry.quality_points.toLocaleString()}</td>
                <td className="badge-count-cell">{entry.badge_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="leaderboard-note">
        Contributor IDs are anonymized hashes. Quality points exclude unreviewed submissions.
      </p>
    </div>
  );
}
