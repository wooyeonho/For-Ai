import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCommunityChallenges } from "@/lib/challenges";
import { isValidLocale } from "@/lib/i18n";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Community Challenges | For-Ai",
  description:
    "Community challenges for collecting accepted contribution candidates for claim-level facts without implying automatic verification.",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
}

export default async function ChallengesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  const challenges = getCommunityChallenges();

  return (
    <article className="challenge-page" aria-labelledby="challenges-title">
      <header className="registry-panel goal-hero challenge-hero">
        <p className="eyebrow">Community challenges</p>
        <h1 id="challenges-title">Collect source-backed candidates without shortcutting verification.</h1>
        <p className="direct-answer-text">
          <strong>Summary:</strong> Challenge progress counts accepted contributions only; completion never means claims are automatically verified.
        </p>
        <details style={{ marginTop: 12 }}>
          <summary>How challenges feed verification</summary>
          <ul className="campaign-principles">
            <li>Each challenge is a structured intake goal for the For-Ai fact registry.</li>
            <li>Accepted contributions can help reviewers create or update claims.</li>
            <li>Verified status still requires source-backed human approval.</li>
          </ul>
        </details>
      </header>

      <section className="registry-panel" aria-labelledby="challenge-rules">
        <h2 id="challenge-rules">Non-negotiable progress rules</h2>
        <ul className="campaign-principles">
          <li>Only accepted contributions are reflected in progress.</li>
          <li>Challenge completion is not automatic claim verification.</li>
          <li>Sponsored challenges are labeled clearly and cannot compromise fact integrity.</li>
        </ul>
      </section>

      <section className="challenge-grid" aria-label="Challenge list">
        {challenges.length === 0 ? (
          <EmptyState
            status="No community challenges are available right now."
            reason="No structured intake goals have been published for this locale."
            action="Submit a missing source-backed topic or check back when new challenge windows open."
          />
        ) : challenges.map((challenge) => (
          <article className="registry-panel challenge-card" key={challenge.challenge_id}>
            <div className="claim-card-topline">
              <span className="badge">{challenge.status}</span>
              {challenge.sponsor_label ? <span className="badge badge-warning">Sponsored</span> : null}
            </div>
            <h2>{challenge.title}</h2>
            {challenge.sponsor_label ? (
              <p className="challenge-sponsored-label">{challenge.sponsor_label}</p>
            ) : null}
            <p>{challenge.description}</p>
            <dl className="meta-grid challenge-meta">
              <div className="meta-item">
                <dt className="meta-label">Challenge ID</dt>
                <dd>{challenge.challenge_id}</dd>
              </div>
              <div className="meta-item">
                <dt className="meta-label">Category</dt>
                <dd>{challenge.category}</dd>
              </div>
              <div className="meta-item">
                <dt className="meta-label">Country</dt>
                <dd>{challenge.country ?? "GLOBAL"}</dd>
              </div>
              <div className="meta-item">
                <dt className="meta-label">Window</dt>
                <dd>{formatDate(challenge.starts_at)} – {formatDate(challenge.ends_at)}</dd>
              </div>
            </dl>
            <div className="challenge-progress" aria-label={`${challenge.title} progress`}>
              <div>
                <strong>{challenge.progress.accepted_count.toLocaleString("en-US")}</strong>
                <span> / {challenge.target_count.toLocaleString("en-US")} {challenge.target_metric}</span>
              </div>
              <div className="challenge-progress-bar" aria-hidden="true">
                <span style={{ inlineSize: `${challenge.progress_percent}%` }} />
              </div>
              <small>{challenge.progress_percent}% complete from accepted contributions only.</small>
            </div>
            <div style={{ marginTop: 16 }}>
              <Link className="cta-link" href={`/${locale}/challenges/${challenge.challenge_id}`}>
                View challenge details
              </Link>
            </div>
          </article>
        ))}
      </section>
    </article>
  );
}

function EmptyState({ status, reason, action }: { status: string; reason: string; action: string }) {
  return (
    <div className="registry-panel stat-note" role="status">
      <p><strong>Current status:</strong> {status}</p>
      <p><strong>Why it is empty:</strong> {reason}</p>
      <p><strong>Next action:</strong> {action}</p>
    </div>
  );
}
