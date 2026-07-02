"use client";

import { useEffect, useState } from "react";

type MySubmission = {
  type: "topic_candidate" | "topic_suggestion" | "report" | "hallucination_report" | "source_suggestion";
  id: string;
  status: string | null;
  summary: string;
  created_at: string | null;
};

const TYPE_LABELS: Record<MySubmission["type"], string> = {
  topic_candidate: "Topic candidate",
  topic_suggestion: "Topic suggestion",
  report: "Correction report",
  hallucination_report: "Hallucination report",
  source_suggestion: "Source suggestion",
};

// Status vocabularies differ per table (submission_status vs topic_candidates'
// own check constraint), so this maps everything into one small display set
// instead of hardcoding every possible DB value.
function statusClass(status: string | null): string {
  const s = (status ?? "").toLowerCase();
  if (["accepted", "approved", "promoted"].includes(s)) return "badge badge-verified";
  if (["rejected", "spam", "spam_suspected"].includes(s)) return "badge badge-review";
  return "badge";
}

export function MineClient() {
  const [submissions, setSubmissions] = useState<MySubmission[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/contributions/mine");
        if (!res.ok) {
          if (!cancelled) setError("Could not load your submissions right now.");
          return;
        }
        const data = await res.json();
        if (!cancelled) setSubmissions(data.submissions ?? []);
      } catch {
        if (!cancelled) setError("Network error. Please try again.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <p className="empty-state">{error}</p>;
  if (submissions === null) return <p className="loading-text">Loading your submissions…</p>;
  if (submissions.length === 0) {
    return (
      <p className="empty-state">
        No submissions found from this device yet. Submissions are matched by your network address, so this list
        only shows what was submitted from here.
      </p>
    );
  }

  return (
    <table className="leaderboard-table">
      <thead>
        <tr>
          <th>Type</th>
          <th>Summary</th>
          <th>Status</th>
          <th>Submitted</th>
        </tr>
      </thead>
      <tbody>
        {submissions.map((s) => (
          <tr key={`${s.type}-${s.id}`}>
            <td>{TYPE_LABELS[s.type]}</td>
            <td>{s.summary}</td>
            <td><span className={statusClass(s.status)}>{s.status ?? "unknown"}</span></td>
            <td>{s.created_at ? new Date(s.created_at).toLocaleDateString() : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
