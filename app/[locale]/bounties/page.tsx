import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CLAIM_BOUNTY_POLICY, SAMPLE_CLAIM_BOUNTIES, isSponsoredBounty } from "../../../lib/bounties";
import { LOCALE_CONFIG, SUPPORTED_LOCALES, isValidLocale } from "../../../lib/i18n";

export const revalidate = 60;

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isValidLocale(locale)) return { title: "Bounties not found" };
  return {
    title: "Claim bounties — For-Ai",
    description: "Source-finding bounties for claim-level facts. Contributors submit source candidates; independent verification decides verified status.",
    alternates: { languages: Object.fromEntries(SUPPORTED_LOCALES.map((l) => [l, `/${l}/bounties`])) },
  };
}

export default async function BountiesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  const openCount = SAMPLE_CLAIM_BOUNTIES.filter((bounty) => bounty.status === "open").length;
  const sponsoredCount = SAMPLE_CLAIM_BOUNTIES.filter(isSponsoredBounty).length;

  return (
    <article>
      <header className="registry-panel">
        <p className="eyebrow">Claim-level source bounties</p>
        <h1>Source bounties for verifiable facts</h1>
        <p>
          Bounties help contributors find source candidates for claims or topic candidates. They do not buy verification, rankings, or factual conclusions.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <span className="badge badge-verified">{openCount} open</span>
          <span className="badge badge-warning">{sponsoredCount} sponsored labeled</span>
          <span className="badge badge-review">contributors submit sources only</span>
        </div>
      </header>

      <section className="registry-panel" aria-labelledby="bounty-policy">
        <p className="eyebrow">Non-negotiable policy</p>
        <h2 id="bounty-policy">Sponsorship is separate from verification</h2>
        <ul className="link-list">
          <li>{CLAIM_BOUNTY_POLICY.sponsorVerificationIndependence}</li>
          <li>{CLAIM_BOUNTY_POLICY.sponsoredDisclosure}</li>
          <li>{CLAIM_BOUNTY_POLICY.contributorLimit}</li>
        </ul>
      </section>

      <section className="registry-panel" aria-labelledby="available-bounties">
        <p className="eyebrow">Available tasks</p>
        <h2 id="available-bounties">Bounty queue</h2>
        <ul className="registry-index">
          {SAMPLE_CLAIM_BOUNTIES.map((bounty) => (
            <li key={bounty.bounty_id} className="registry-row">
              <div className="registry-row-main">
                <Link className="registry-row-title" href={`/${locale}/bounties/${bounty.bounty_id}`}>
                  {bounty.title}
                </Link>
                <span className="registry-row-entity">
                  {bounty.country} · {bounty.category} · target: {bounty.claim_id ? "claim_id" : "topic_candidate_id"}
                </span>
                {isSponsoredBounty(bounty) ? (
                  <span className="meta-label">Sponsored bounty: {bounty.sponsor_label} ({bounty.sponsor_type})</span>
                ) : (
                  <span className="meta-label">Unsponsored community verification task</span>
                )}
              </div>
              <div className="registry-row-meta">
                <span className={bounty.status === "open" ? "badge badge-verified" : "badge badge-review"}>{bounty.status}</span>
                <span className="badge">{bounty.reward_points} pts</span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <nav className="registry-panel" aria-labelledby="bounty-languages">
        <h2 id="bounty-languages">Other languages</h2>
        <ul className="link-list" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {SUPPORTED_LOCALES.filter((l) => l !== locale).map((l) => (
            <li key={l}><Link href={`/${l}/bounties`}>{LOCALE_CONFIG[l].flag} {LOCALE_CONFIG[l].nativeName}</Link></li>
          ))}
        </ul>
      </nav>
    </article>
  );
}
