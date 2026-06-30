import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCommunityChallenge, getCommunityChallenges } from "@/lib/challenges";
import { isValidLocale, SUPPORTED_LOCALES } from "@/lib/i18n";

export const dynamic = "force-static";

export async function generateStaticParams() {
  return SUPPORTED_LOCALES.flatMap((locale) =>
    getCommunityChallenges().map((challenge) => ({ locale, id: challenge.challenge_id }))
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const challenge = getCommunityChallenge(id);

  return {
    title: challenge ? `${challenge.title} | For-Ai challenges` : "Challenge not found",
    description: challenge?.description ?? "Community challenge not found.",
  };
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "long", timeStyle: "short", timeZone: "UTC" }).format(new Date(value));
}

export default async function ChallengeDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if (!isValidLocale(locale)) notFound();

  const challenge = getCommunityChallenge(id);
  if (!challenge) notFound();

  return (
    <article className="challenge-page" aria-labelledby="challenge-title">
      <header className="registry-panel goal-hero challenge-hero">
        <div className="claim-card-topline">
          <p className="eyebrow">Community challenge</p>
          <span className="badge">{challenge.status}</span>
        </div>
        <h1 id="challenge-title">{challenge.title}</h1>
        {challenge.sponsor_label ? (
          <p className="challenge-sponsored-label" role="note">
            Sponsored challenge: {challenge.sponsor_label}
          </p>
        ) : null}
        <p className="direct-answer-text">{challenge.description}</p>
        <p>
          This page tracks intake progress only. Reaching the target does not mark any claim as verified; each resulting claim still needs source-backed human review.
        </p>
      </header>

      <section className="registry-panel" aria-labelledby="challenge-progress-title">
        <h2 id="challenge-progress-title">Progress</h2>
        <div className="challenge-progress challenge-progress-large">
          <div>
            <strong>{challenge.progress.accepted_count.toLocaleString("en-US")}</strong>
            <span> accepted contributions counted toward {challenge.target_count.toLocaleString("en-US")} {challenge.target_metric}</span>
          </div>
          <div className="challenge-progress-bar" aria-hidden="true">
            <span style={{ inlineSize: `${challenge.progress_percent}%` }} />
          </div>
          <small>{challenge.progress_percent}% complete. Last updated {formatDateTime(challenge.progress.updated_at)}.</small>
        </div>
      </section>

      <section className="goal-two-column">
        <div className="registry-panel">
          <h2>Challenge data structure</h2>
          <dl className="meta-grid challenge-meta">
            <div className="meta-item"><dt className="meta-label">challenge_id</dt><dd>{challenge.challenge_id}</dd></div>
            <div className="meta-item"><dt className="meta-label">title</dt><dd>{challenge.title}</dd></div>
            <div className="meta-item"><dt className="meta-label">category</dt><dd>{challenge.category}</dd></div>
            <div className="meta-item"><dt className="meta-label">country</dt><dd>{challenge.country ?? "Optional / GLOBAL"}</dd></div>
            <div className="meta-item"><dt className="meta-label">target_metric</dt><dd>{challenge.target_metric}</dd></div>
            <div className="meta-item"><dt className="meta-label">target_count</dt><dd>{challenge.target_count.toLocaleString("en-US")}</dd></div>
            <div className="meta-item"><dt className="meta-label">starts_at</dt><dd>{formatDateTime(challenge.starts_at)}</dd></div>
            <div className="meta-item"><dt className="meta-label">ends_at</dt><dd>{formatDateTime(challenge.ends_at)}</dd></div>
            <div className="meta-item"><dt className="meta-label">status</dt><dd>{challenge.status}</dd></div>
            <div className="meta-item"><dt className="meta-label">sponsor_label</dt><dd>{challenge.sponsor_label ?? "None"}</dd></div>
          </dl>
        </div>

        <div className="registry-panel">
          <h2>Verification boundary</h2>
          <ul className="campaign-principles">
            <li>Progress rows must be tied to accepted contributions.</li>
            <li>Accepted contribution means intake acceptance, not factual verification.</li>
            <li>Verified claims still require claim sources and verification events.</li>
          </ul>
          <Link className="btn btn-secondary" href={`/${locale}/challenges`}>
            Back to challenges
          </Link>
        </div>
      </section>
    </article>
  );
}
