import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { experimentalGamificationEnabled } from "@/lib/feature-flags";
import { SUPPORTED_LOCALES, getTranslations, isValidLocale } from "../../../lib/i18n";
import type { SupportedLocale } from "../../../lib/i18n";
import {
  DUPLICATE_URL_FREE_LIMIT,
  REJECTED_OR_SPAM_PENALTY,
  WEIGHTS,
  displayContributor,
  getLeaderboard,
  hasLiveLeaderboardData,
} from "../../../lib/leaderboard-data";

export const revalidate = 300;

type LeaderboardParams = { locale: string };

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<LeaderboardParams> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isValidLocale(locale)) return { title: getTranslations("en").leaderboard.notFound };
  const t = getTranslations(locale as SupportedLocale);

  return {
    title: t.leaderboard.metadataTitle,
    description: t.leaderboard.metadataDescription,
    alternates: {
      languages: Object.fromEntries(SUPPORTED_LOCALES.map((l) => [l, `/${l}/leaderboard`])),
    },
  };
}

export default async function LeaderboardPage({ params }: { params: Promise<LeaderboardParams> }) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  const t = getTranslations(locale as SupportedLocale);
  const rankingEnabled = experimentalGamificationEnabled();
  const leaderboard = rankingEnabled ? await getLeaderboard() : [];
  const hasLiveData = rankingEnabled && hasLiveLeaderboardData();

  return (
    <article>
      <header className="registry-panel">
        <p className="eyebrow">{t.leaderboard.eyebrow}</p>
        <h1>{t.leaderboard.title}</h1>
        <p style={{ maxWidth: 780 }}>
          {t.leaderboard.description}
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <span className="badge badge-verified">{t.leaderboard.acceptedSources} × {WEIGHTS.accepted_sources}</span>
          <span className="badge badge-verified">{t.leaderboard.verifiedClaims} × {WEIGHTS.verified_claims}</span>
          <span className="badge badge-warning">{t.leaderboard.staleFixes} × {WEIGHTS.stale_fixes}</span>
          <span className="badge">{t.leaderboard.countryCoverage} × {WEIGHTS.country_coverage}</span>
        </div>
      </header>

      <section className="registry-panel" aria-labelledby="leaderboard-ranking">
        <p className="eyebrow">{t.leaderboard.rankingEyebrow}</p>
        <h2 id="leaderboard-ranking">{t.leaderboard.currentRanking}</h2>
        {!rankingEnabled ? (
          <p className="stat-note">
            {t.leaderboard.rankingNotYetEnabled}
          </p>
        ) : !hasLiveData ? (
          <p className="stat-note">
            {t.leaderboard.liveDataRequired}
          </p>
        ) : leaderboard.length === 0 ? (
          <p className="stat-note">{t.leaderboard.noEligibleActivity}</p>
        ) : (
          <ol className="registry-index">
            {leaderboard.map((entry, index) => (
              <li key={entry.contributorHash} className="registry-row">
                <div className="registry-row-main">
                  <strong className="registry-row-title">#{index + 1} {displayContributor(entry.contributorHash)}</strong>
                  <span className="registry-row-entity">
                    {entry.countries.length} {t.leaderboard.countries} · {entry.categories.length} {t.leaderboard.categories} · {t.leaderboard.abuseAdjustedScore} {entry.score}
                  </span>
                  <span className="meta-label">
                    {t.leaderboard.acceptedSources} {entry.acceptedSources}, {t.leaderboard.verifiedClaims} {entry.verifiedClaims}, {t.leaderboard.staleFixes} {entry.staleFixes}, {t.leaderboard.acceptedHallucinationReports} {entry.acceptedHallucinations}
                  </span>
                </div>
                <div className="registry-row-meta">
                  <span className="badge badge-verified">{entry.score} {t.leaderboard.points}</span>
                  {entry.rejectedOrSpam > 0 ? <span className="badge badge-warning">{t.leaderboard.moderationPenalties} {entry.rejectedOrSpam}</span> : null}
                  {entry.duplicateUrlOverflow > 0 ? <span className="badge badge-warning">{t.leaderboard.duplicateUrlCap} {entry.duplicateUrlOverflow}</span> : null}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="registry-panel" aria-labelledby="leaderboard-rules">
        <p className="eyebrow">{t.leaderboard.scoringEyebrow}</p>
        <h2 id="leaderboard-rules">{t.leaderboard.criteriaTitle}</h2>
        <ul className="link-list">
          <li><strong>Accepted sources:</strong> claim_sources that pass review or are attached to a verified claim. Repeated identical URLs from the same contributor are capped after {DUPLICATE_URL_FREE_LIMIT} credits.</li>
          <li><strong>Verified claim contributions:</strong> contributor_hash values on verification_events that move claims to verified or record human review of a verified claim.</li>
          <li><strong>Stale claim fixes:</strong> high-value verification_events that restore stale or low-confidence facts to current verified claims.</li>
          <li><strong>Hallucination reports accepted:</strong> only moderated hallucination_reports with status accepted are counted.</li>
          <li><strong>Country coverage:</strong> unique countries touched by eligible accepted contributions.</li>
          <li><strong>Category-specific contributions:</strong> unique registry categories touched by eligible accepted contributions.</li>
        </ul>
      </section>

      <section className="registry-panel" aria-labelledby="spam-controls" style={{ background: "#fffbeb", borderInlineStart: "3px solid #f59e0b" }}>
        <p className="eyebrow">{t.leaderboard.abuseEyebrow}</p>
        <h2 id="spam-controls">{t.leaderboard.spamTitle}</h2>
        <ul className="link-list">
          <li>Raw submission count is never part of the score.</li>
          <li>Rejected or spam submissions are excluded and subtract {REJECTED_OR_SPAM_PENALTY} points each when visible to server-side moderation queries.</li>
          <li>Identical URL submissions by the same contributor_hash receive limited credit to prevent repeated-source farming.</li>
          <li>Abuse detection uses contributor_hash only. Raw IP addresses are not stored or displayed.</li>
          <li>Public output shows pseudonymous contributor labels, not full hashes or private submission rows.</li>
        </ul>
      </section>

      <section className="registry-panel" aria-labelledby="reward-rules">
        <h2 id="reward-rules">{t.leaderboard.rewardRules}</h2>
        <ul>
          <li>Source submitted: 1 point, pending review.</li>
          <li>Source accepted: 5 points after admin acceptance.</li>
          <li>Claim verified from contribution: 20 points after admin verification approval.</li>
          <li>Hallucination report accepted: 10 points after admin acceptance.</li>
        </ul>
      </section>

      <nav className="registry-panel" aria-labelledby="leaderboard-actions">
        <h2 id="leaderboard-actions">{t.leaderboard.actionsTitle}</h2>
        <p>Submit missing facts without logging in. They remain Needs verification until a traceable source and human approval are recorded.</p>
        <Link className="btn btn-primary" href={`/suggest-topic?lang=${encodeURIComponent(locale)}`}>{t.leaderboard.submitMissingFact}</Link>
      </nav>
    </article>
  );
}
