import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { experimentalGamificationEnabled } from "@/lib/feature-flags";
import { CLAIM_BOUNTY_POLICY, SAMPLE_CLAIM_BOUNTIES, isSponsoredBounty } from "../../../lib/bounties";
import { LOCALE_CONFIG, SUPPORTED_LOCALES, getTranslations, isValidLocale } from "../../../lib/i18n";
import type { SupportedLocale } from "../../../lib/i18n";

export const revalidate = 60;

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isValidLocale(locale)) return { title: getTranslations("en").bounties.notFound };
  const t = getTranslations(locale as SupportedLocale);
  return {
    title: t.bounties.metadataTitle,
    description: t.bounties.metadataDescription,
    alternates: { languages: Object.fromEntries(SUPPORTED_LOCALES.map((l) => [l, `/${l}/bounties`])) },
  };
}

export default async function BountiesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!experimentalGamificationEnabled()) notFound();
  if (!isValidLocale(locale)) notFound();

  const t = getTranslations(locale as SupportedLocale);
  const openCount = SAMPLE_CLAIM_BOUNTIES.filter((bounty) => bounty.status === "open").length;
  const sponsoredCount = SAMPLE_CLAIM_BOUNTIES.filter(isSponsoredBounty).length;

  return (
    <article>
      <header className="registry-panel">
        <p className="eyebrow">{t.bounties.eyebrow}</p>
        <h1>{t.bounties.title}</h1>
        <p>
          {t.bounties.description}
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <span className="badge badge-verified">{openCount} {t.bounties.open}</span>
          <span className="badge badge-warning">{sponsoredCount} {t.bounties.sponsoredLabeled}</span>
          <span className="badge badge-review">{t.bounties.contributorsSubmitSourcesOnly}</span>
        </div>
      </header>

      <section className="registry-panel" aria-labelledby="bounty-policy">
        <p className="eyebrow">{t.bounties.policyEyebrow}</p>
        <h2 id="bounty-policy">{t.bounties.policyTitle}</h2>
        <ul className="link-list">
          <li>{CLAIM_BOUNTY_POLICY.sponsorVerificationIndependence}</li>
          <li>{CLAIM_BOUNTY_POLICY.sponsoredDisclosure}</li>
          <li>{CLAIM_BOUNTY_POLICY.contributorLimit}</li>
        </ul>
      </section>

      <section className="registry-panel" aria-labelledby="available-bounties">
        <p className="eyebrow">{t.bounties.availableTasks}</p>
        <h2 id="available-bounties">{t.bounties.bountyQueue}</h2>
        <ul className="registry-index">
          {SAMPLE_CLAIM_BOUNTIES.map((bounty) => (
            <li key={bounty.bounty_id} className="registry-row">
              <div className="registry-row-main">
                <Link className="registry-row-title" href={`/${locale}/bounties/${bounty.bounty_id}`}>
                  {bounty.title}
                </Link>
                <span className="registry-row-entity">
                  {bounty.country} · {bounty.category} · {t.bounties.target}: {bounty.claim_id ? "claim_id" : "topic_candidate_id"}
                </span>
                {isSponsoredBounty(bounty) ? (
                  <span className="meta-label">{t.bounties.sponsoredBounty}: {bounty.sponsor_label} ({bounty.sponsor_type})</span>
                ) : (
                  <span className="meta-label">{t.bounties.unsponsoredTask}</span>
                )}
              </div>
              <div className="registry-row-meta">
                <span className={bounty.status === "open" ? "badge badge-verified" : "badge badge-review"}>{bounty.status}</span>
                <span className="badge">{bounty.reward_points} {t.bounties.points}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <nav className="registry-panel" aria-labelledby="bounty-languages">
        <h2 id="bounty-languages">{t.bounties.otherLanguages}</h2>
        <ul className="link-list" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {SUPPORTED_LOCALES.filter((l) => l !== locale).map((l) => (
            <li key={l}><Link href={`/${l}/bounties`}>{LOCALE_CONFIG[l].flag} {LOCALE_CONFIG[l].nativeName}</Link></li>
          ))}
        </ul>
      </nav>
    </article>
  );
}
