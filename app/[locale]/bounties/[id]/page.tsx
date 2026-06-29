import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CLAIM_BOUNTY_POLICY, SAMPLE_CLAIM_BOUNTIES, getBountyById, isSponsoredBounty } from "../../../../lib/bounties";
import { SUPPORTED_LOCALES, isValidLocale } from "../../../../lib/i18n";

export const revalidate = 60;

type Params = { locale: string; id: string };

export function generateStaticParams() {
  return SUPPORTED_LOCALES.flatMap((locale) => SAMPLE_CLAIM_BOUNTIES.map((bounty) => ({ locale, id: bounty.bounty_id })));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { locale, id } = await params;
  if (!isValidLocale(locale)) return { title: "Bounty not found" };
  const bounty = getBountyById(id);
  if (!bounty) return { title: "Bounty not found" };
  return { title: `${bounty.title} — For-Ai bounty`, description: bounty.description };
}

export default async function BountyDetailPage({ params }: { params: Promise<Params> }) {
  const { locale, id } = await params;
  if (!isValidLocale(locale)) notFound();
  const bounty = getBountyById(id);
  if (!bounty) notFound();

  const targetLabel = bounty.claim_id ? "claim_id" : "topic_candidate_id";
  const targetValue = bounty.claim_id ?? bounty.topic_candidate_id;

  return (
    <article>
      <header className="registry-panel">
        <p className="eyebrow">Bounty detail</p>
        <h1>{bounty.title}</h1>
        <p>{bounty.description}</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <span className={bounty.status === "open" ? "badge badge-verified" : "badge badge-review"}>{bounty.status}</span>
          <span className="badge">{bounty.reward_points} reward points</span>
          {isSponsoredBounty(bounty) ? <span className="badge badge-warning">Sponsored: {bounty.sponsor_label}</span> : <span className="badge">not sponsored</span>}
        </div>
      </header>

      <section className="registry-panel" aria-labelledby="bounty-fields">
        <h2 id="bounty-fields">Data structure fields</h2>
        <dl className="meta-grid">
          <div className="meta-item"><dt className="meta-label">bounty_id</dt><dd>{bounty.bounty_id}</dd></div>
          <div className="meta-item"><dt className="meta-label">{targetLabel}</dt><dd>{targetValue}</dd></div>
          <div className="meta-item"><dt className="meta-label">country</dt><dd>{bounty.country}</dd></div>
          <div className="meta-item"><dt className="meta-label">category</dt><dd>{bounty.category}</dd></div>
          <div className="meta-item"><dt className="meta-label">sponsor_type</dt><dd>{bounty.sponsor_type}</dd></div>
          <div className="meta-item"><dt className="meta-label">sponsor_label</dt><dd>{bounty.sponsor_label ?? "none"}</dd></div>
          <div className="meta-item"><dt className="meta-label">created_at</dt><dd>{bounty.created_at}</dd></div>
          <div className="meta-item"><dt className="meta-label">expires_at</dt><dd>{bounty.expires_at ?? "none"}</dd></div>
        </dl>
      </section>

      <section className="registry-panel" aria-labelledby="submission-rules">
        <p className="eyebrow">bounty_submissions rules</p>
        <h2 id="submission-rules">What contributors can submit</h2>
        <p>{CLAIM_BOUNTY_POLICY.contributorLimit}</p>
        <ul className="link-list">
          {bounty.source_candidate_examples.map((example) => <li key={example}>{example}</li>)}
        </ul>
      </section>

      <section className="registry-panel" aria-labelledby="verification-independence" style={{ background: "#fffbeb", borderInlineStart: "3px solid #f59e0b" }}>
        <p className="eyebrow">Verification firewall</p>
        <h2 id="verification-independence">Sponsored bounty ≠ verified fact</h2>
        <p>{CLAIM_BOUNTY_POLICY.sponsorVerificationIndependence}</p>
        <p>{CLAIM_BOUNTY_POLICY.sponsoredDisclosure}</p>
      </section>

      <nav className="registry-panel" aria-label="Bounty navigation">
        <Link className="btn btn-secondary" href={`/${locale}/bounties`}>Back to bounties</Link>
      </nav>
    </article>
  );
}
