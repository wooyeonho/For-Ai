"use client";

import { useState, useEffect } from "react";
import { BADGES } from "../../lib/badges";

function getLocalHash(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("contributor_hash_preview") ?? null;
}

type ContributorStats = {
  total_points: number;
  events: Array<{ event_type: string; points: number; created_at: string }>;
  badges: Array<{ badge_slug: string; awarded_at: string; name?: string; icon?: string }>;
  rank_this_week: number | null;
};

export function ContributeClient() {
  const [contributorHash, setContributorHash] = useState<string | null>(null);
  const [stats, setStats] = useState<ContributorStats | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const hash = getLocalHash();
    if (hash) {
      setContributorHash(hash);
      loadStats(hash);
    }
  }, []);

  async function loadStats(hash: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/gamification/contributor/${hash}`);
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } finally {
      setLoading(false);
    }
  }

  // Source suggestion form state
  const [claimId, setClaimId] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceTitle, setSourceTitle] = useState("");
  const [citation, setCitation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ points?: number; badges?: string[]; error?: string } | null>(null);

  async function handleSourceSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!claimId.trim() || (!sourceUrl.trim() && !citation.trim())) return;
    setSubmitting(true);
    setSubmitResult(null);
    try {
      const res = await fetch("/api/source-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claim_id: claimId.trim(),
          url: sourceUrl.trim() || undefined,
          title: sourceTitle.trim() || undefined,
          citation: citation.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitResult({ error: data.error ?? "Submission failed" });
      } else {
        setSubmitResult({
          points: data.points_awarded,
          badges: data.new_badges ?? [],
        });
        setClaimId("");
        setSourceUrl("");
        setSourceTitle("");
        setCitation("");
        // Reload stats if we have a hash
        if (contributorHash) loadStats(contributorHash);
      }
    } catch {
      setSubmitResult({ error: "Network error. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="contribute-client">
      {/* Source submission form */}
      <div className="source-submit-section">
        <h3>Submit a Source Candidate</h3>
        <p className="form-desc">
          Know the official source for a claim? Submit it here. If admin accepts it, you earn points.
        </p>
        <form onSubmit={handleSourceSubmit} className="source-form">
          <div className="form-field">
            <label htmlFor="claim-id">Claim ID</label>
            <input
              id="claim-id"
              type="text"
              value={claimId}
              onChange={(e) => setClaimId(e.target.value)}
              placeholder="e.g. claim-seoul-metro-base-fare-adult"
              required
            />
            <span className="field-hint">Found in the claim table on any fact page.</span>
          </div>
          <div className="form-field">
            <label htmlFor="source-url">Source URL</label>
            <input
              id="source-url"
              type="url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://official.gov/page"
            />
            <span className="field-hint">Official government or platform URLs earn bonus points.</span>
          </div>
          <div className="form-field">
            <label htmlFor="source-title">Source Title (optional)</label>
            <input
              id="source-title"
              type="text"
              value={sourceTitle}
              onChange={(e) => setSourceTitle(e.target.value)}
              placeholder="Official Fare Schedule 2025"
            />
          </div>
          <div className="form-field">
            <label htmlFor="citation">Citation / Quote (optional)</label>
            <textarea
              id="citation"
              value={citation}
              onChange={(e) => setCitation(e.target.value)}
              placeholder="Exact text from the official source..."
              rows={3}
            />
          </div>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? "Submitting…" : "Submit Source"}
          </button>
        </form>

        {submitResult && (
          <div className={`submit-result ${submitResult.error ? "result-error" : "result-success"}`}>
            {submitResult.error ? (
              <p>{submitResult.error}</p>
            ) : (
              <>
                <p>Submitted. You earned <strong>+{submitResult.points} points</strong>.</p>
                {(submitResult.badges ?? []).length > 0 && (
                  <p>
                    New badges earned:{" "}
                    {submitResult.badges!.map((slug) => BADGES[slug]?.name ?? slug).join(", ")}
                  </p>
                )}
                <p className="result-note">Final points are awarded when admin reviews your submission.</p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Contributor stats panel */}
      {stats && (
        <div className="contributor-stats-panel">
          <h3>Your Contributions</h3>
          <div className="stats-summary">
            <div className="stat-item">
              <span className="stat-value">{stats.total_points}</span>
              <span className="stat-label">Total Points</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{stats.badges.length}</span>
              <span className="stat-label">Badges Earned</span>
            </div>
          </div>
          {stats.badges.length > 0 && (
            <div className="earned-badges">
              {stats.badges.map((b) => (
                <div key={b.badge_slug} className="earned-badge-chip">
                  <span className="badge-chip-icon">{b.icon ?? b.badge_slug.slice(0, 2).toUpperCase()}</span>
                  <span className="badge-chip-name">{b.name ?? b.badge_slug}</span>
                </div>
              ))}
            </div>
          )}
          {stats.events.length > 0 && (
            <div className="recent-events">
              <h4>Recent Activity</h4>
              <table className="events-table">
                <tbody>
                  {stats.events.slice(0, 8).map((e, i) => (
                    <tr key={i}>
                      <td className="event-type">{e.event_type.replace(/_/g, " ")}</td>
                      <td className="event-points">+{e.points}</td>
                      <td className="event-date">{new Date(e.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {loading && <p className="loading-text">Loading your stats…</p>}
    </div>
  );
}
