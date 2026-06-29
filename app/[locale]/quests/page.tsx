import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCountryQuests, getContributionEvents, summarizeContributors } from "../../../lib/contributions";
import { isValidLocale } from "../../../lib/i18n";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Country quests and contributor badges | For-Ai",
  description: "Country-level verified claim targets and anonymous contributor badge summaries for For-Ai.",
};

function countryName(country: string, locale: string) {
  if (country.toLowerCase() === "global") return "Global";
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(country) ?? country;
  } catch {
    return country;
  }
}

function shortHash(hash: string) {
  return `${hash.slice(0, 8)}…${hash.slice(-4)}`;
}

export default async function QuestsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();
  const [quests, events] = await Promise.all([getCountryQuests(), getContributionEvents()]);
  const contributors = summarizeContributors(events).slice(0, 12);

  return (
    <article>
      <header className="registry-panel">
        <p className="eyebrow">Country quest</p>
        <h1>Country quests and badges</h1>
        <p style={{ maxWidth: 760 }}>
          Country quests track verified claim coverage against a target count. Badges are calculated from contribution
          events only, so rewards never bypass the admin approval gate for verified facts.
        </p>
      </header>

      <section className="registry-panel" aria-labelledby="country-quests">
        <h2 id="country-quests">Verified / target count by country</h2>
        {quests.length === 0 ? (
          <p>No country quest data yet.</p>
        ) : (
          <ul className="link-list">
            {quests.map((quest) => (
              <li key={quest.country} style={{ paddingBlock: 10 }}>
                <Link href={`/${locale}/country/${quest.country.toLowerCase()}`}>{countryName(quest.country, locale)}</Link>
                <div className="meta-label">{quest.verified} verified claims / {quest.target} target · {quest.remaining} remaining</div>
                <progress value={quest.verified} max={quest.target} style={{ width: "100%" }} aria-label={`${quest.country} quest progress`} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="registry-panel" aria-labelledby="badge-summary">
        <h2 id="badge-summary">Anonymous contributor badge summary</h2>
        {contributors.length === 0 ? (
          <p>No contributor events yet.</p>
        ) : (
          <ul className="link-list">
            {contributors.map((contributor) => (
              <li key={contributor.contributor_hash} style={{ paddingBlock: 10 }}>
                <strong>Contributor {shortHash(contributor.contributor_hash)}</strong>
                <div className="meta-label">{contributor.total_points} points · {contributor.weekly_accepted} weekly accepted</div>
                <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                  {contributor.badges.map((badge) => (
                    <div key={badge.code}>
                      <span className={badge.earned ? "badge badge-verified" : "badge badge-review"}>{badge.name}</span>{" "}
                      <span className="meta-label">{badge.progress}/{badge.target} · {badge.description}</span>
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}
