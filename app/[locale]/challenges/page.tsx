import type { Metadata } from "next";
import Link from "next/link";
import { getCommunityChallenges } from "@/lib/challenges";

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
  const challenges = getCommunityChallenges();

  return (
    <article className="challenge-page" aria-labelledby="challenges-title">
      <header className="registry-panel goal-hero challenge-hero">
        <p className="eyebrow">Community challenges</p>
        <h1 id="challenges-title">Collect source-backed candidates without shortcutting verification.</h1>
        <p className="direct-answer-text">
          Challenge progress counts accepted contributions only. Completion never means claims are automatically verified.
        </p>
        <p>
          Each challenge is a structured intake goal for the For-Ai fact registry. Accepted contributions can help reviewers create or update claims, but verified status still requires source-backed human approval.
        </p>
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
        {challenges.map((challenge) => (
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
            <Link className="cta-link" href={`/${locale}/challenges/${challenge.challenge_id}`}>
              View challenge details
            </Link>
          </article>
        ))}
      </section>
    </article>
  );
}
