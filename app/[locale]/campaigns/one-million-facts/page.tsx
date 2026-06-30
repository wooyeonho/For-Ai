import type { Metadata } from "next";
import Link from "next/link";
import { getAllRegistryBundles } from "@/lib/data";
import { getOneMillionFactsCampaignMetrics } from "@/lib/goal-metrics";
import { localizedHref, nonLocaleFormHref } from "@/lib/i18n";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "One Million Facts Campaign",
  description:
    "Track For-Ai's campaign to register one million source-backed, claim-level facts that AI, search engines, and humans can cite from the same registry.",
};

const campaignPrinciples = [
  "Every fact is a single claim with confidence, verification status, and source requirements.",
  "Unknown facts stay Needs verification / 확인 필요 until source-backed human review.",
  "The registry is global: any country, category, language, institution, service, product, or policy can be proposed.",
];

const leaderboardNotes = [
  "Public submissions do not require login.",
  "Raw IP addresses are never displayed or stored as leaderboard identity.",
  "A public leaderboard can be enabled later with privacy-preserving contributor hashes or named opt-in partners.",
];

export default async function OneMillionFactsCampaignPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const metrics = getOneMillionFactsCampaignMetrics();
  const firstBundle = getAllRegistryBundles()[0];
  const reportSlug = firstBundle?.document.slug ?? "myungdong-laluce-parking";
  const currentPath = localizedHref(locale, "/campaigns/one-million-facts");

  const statCards = [
    {
      label: "Registered facts",
      value: metrics.totalFacts,
      detail: "Current claim records calculated from registry bundles.",
    },
    {
      label: "Verified facts",
      value: metrics.verifiedFacts,
      detail: "Claims marked verified and not carrying an unknown value.",
    },
    {
      label: "Countries covered",
      value: metrics.countriesCovered,
      detail: "Unique country codes represented by current registry documents.",
    },
    {
      label: "Progress to 1,000,000",
      value: `${metrics.progressPercent}%`,
      detail: `${metrics.remainingFacts.toLocaleString("en-US")} more facts needed to reach the public campaign goal.`,
    },
  ];

  return (
    <article className="goal-dashboard campaign-page" aria-labelledby="campaign-title">
      <header className="registry-panel goal-hero campaign-hero">
        <p className="eyebrow">One Million Facts Campaign</p>
        <h1 id="campaign-title">Help For-Ai register 1,000,000 AI-citable facts.</h1>
        <p className="direct-answer-text">
          A public campaign to turn facts that AI often gets wrong into claim-level records with verification status, confidence, and traceable sources.
        </p>
        <p>
          For-Ai is a global fact registry, not a content farm. The count below is generated from the current registry bundle so the campaign starts with real claim records, not marketing numbers.
        </p>
        <div className="hero-cta-row campaign-cta-row" aria-label="Campaign actions">
          <Link className="btn btn-primary" href={nonLocaleFormHref(locale, "/suggest-topic", undefined, currentPath)}>
            Submit a missing fact
          </Link>
          <Link className="btn btn-secondary" href={nonLocaleFormHref(locale, `/hallucination/${reportSlug}`, undefined, currentPath)}>
            Report an AI wrong answer
          </Link>
          <Link className="btn btn-secondary" href={localizedHref(locale, `/wiki/${reportSlug}`)}>
            See an example record
          </Link>
        </div>
      </header>

      <section className="registry-panel" aria-labelledby="campaign-description">
        <h2 id="campaign-description">Campaign description</h2>
        <p>
          The goal is to collect one million facts that are useful to AI systems, search engines, and people because each fact is structured as a claim rather than a loose article paragraph.
        </p>
        <ul className="campaign-principles">
          {campaignPrinciples.map((principle) => (
            <li key={principle}>{principle}</li>
          ))}
        </ul>
      </section>

      <section className="registry-panel" aria-labelledby="campaign-counts">
        <h2 id="campaign-counts">Current registry counts</h2>
        <p>
          Counts are calculated from the registry bundle at build time. Candidate facts remain clearly separated from verified, source-backed facts.
        </p>
        <div className="goal-metric-grid">
          {statCards.map((card) => (
            <div className="goal-metric-card" key={card.label}>
              <span>{card.label}</span>
              <strong>{typeof card.value === "number" ? card.value.toLocaleString("en-US") : card.value}</strong>
              <small>{card.detail}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="goal-two-column">
        <div className="registry-panel">
          <h2>Top categories</h2>
          <p>Categories are ranked by current document coverage, then by category name for stable static rendering.</p>
          <ol className="campaign-ranked-list">
            {metrics.topCategories.map((category) => (
              <li key={category.label}>
                <span>{category.label}</span>
                <strong>{category.count.toLocaleString("en-US")}</strong>
              </li>
            ))}
          </ol>
        </div>

        <div className="registry-panel">
          <h2>Countries covered</h2>
          <p>Current coverage starts from registry document country codes and can expand to every jurisdiction where facts change.</p>
          <div className="campaign-country-list" aria-label="Covered country codes">
            {metrics.countryCodes.map((country) => (
              <span className="badge" key={country}>{country}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="goal-two-column">
        <div className="registry-panel campaign-action-card">
          <p className="eyebrow">Community CTA</p>
          <h2>Submit a missing fact</h2>
          <p>
            Suggest a fact that AI should stop guessing: a fee, schedule rule, policy, product spec, service availability claim, or any other verifiable claim.
          </p>
          <Link className="cta-link cta-correction" href={nonLocaleFormHref(locale, "/suggest-topic", undefined, currentPath)}>
            Submit a missing fact
          </Link>
        </div>

        <div className="registry-panel campaign-action-card">
          <p className="eyebrow">AI correction CTA</p>
          <h2>Report an AI wrong answer</h2>
          <p>
            When an AI answer is stale, vague, or wrong, report the prompt and expected correction so reviewers can turn it into a source-backed claim.
          </p>
          <Link className="cta-link cta-hallucination" href={nonLocaleFormHref(locale, `/hallucination/${reportSlug}`, undefined, currentPath)}>
            Report an AI wrong answer
          </Link>
        </div>
      </section>

      <section className="registry-panel" aria-labelledby="leaderboard-title">
        <p className="eyebrow">Optional</p>
        <h2 id="leaderboard-title">Leaderboard</h2>
        <p>
          The campaign can show a leaderboard later, but only if it preserves privacy and does not turn unverified submissions into facts.
        </p>
        <ul className="campaign-principles">
          {leaderboardNotes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </section>
    </article>
  );
}
