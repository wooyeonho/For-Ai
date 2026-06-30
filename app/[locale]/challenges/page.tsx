import type { Metadata } from "next";
import Link from "next/link";
import { getCommunityChallenges } from "@/lib/challenges";
import { getTranslations } from "@/lib/i18n";
import type { SupportedLocale } from "@/lib/i18n";

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
  const t = getTranslations(locale as SupportedLocale);
  const challenges = getCommunityChallenges();

  return (
    <article className="challenge-page" aria-labelledby="challenges-title">
      <header className="registry-panel goal-hero challenge-hero">
        <p className="eyebrow">{t.challenges.eyebrow}</p>
        <h1 id="challenges-title">{t.challenges.title}</h1>
        <p className="direct-answer-text">
          {t.challenges.directAnswer}
        </p>
        <p>
          {t.challenges.description}
        </p>
      </header>

      <section className="registry-panel" aria-labelledby="challenge-rules">
        <h2 id="challenge-rules">{t.challenges.rulesTitle}</h2>
        <ul className="campaign-principles">
          <li>{t.challenges.ruleAcceptedOnly}</li>
          <li>{t.challenges.ruleNoAutoVerification}</li>
          <li>{t.challenges.ruleSponsoredLabeled}</li>
        </ul>
      </section>

      <section className="challenge-grid" aria-label={t.challenges.listLabel}>
        {challenges.map((challenge) => (
          <article className="registry-panel challenge-card" key={challenge.challenge_id}>
            <div className="claim-card-topline">
              <span className="badge">{challenge.status}</span>
              {challenge.sponsor_label ? <span className="badge badge-warning">{t.challenges.sponsored}</span> : null}
            </div>
            <h2>{challenge.title}</h2>
            {challenge.sponsor_label ? (
              <p className="challenge-sponsored-label">{challenge.sponsor_label}</p>
            ) : null}
            <p>{challenge.description}</p>
            <dl className="meta-grid challenge-meta">
              <div className="meta-item">
                <dt className="meta-label">{t.challenges.challengeId}</dt>
                <dd>{challenge.challenge_id}</dd>
              </div>
              <div className="meta-item">
                <dt className="meta-label">{t.challenges.category}</dt>
                <dd>{challenge.category}</dd>
              </div>
              <div className="meta-item">
                <dt className="meta-label">{t.challenges.country}</dt>
                <dd>{challenge.country ?? "GLOBAL"}</dd>
              </div>
              <div className="meta-item">
                <dt className="meta-label">{t.challenges.window}</dt>
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
              <small>{challenge.progress_percent}% {t.challenges.completeSuffix}</small>
            </div>
            <Link className="cta-link" href={`/${locale}/challenges/${challenge.challenge_id}`}>
              {t.challenges.viewDetails}
            </Link>
          </article>
        ))}
      </section>
    </article>
  );
}
