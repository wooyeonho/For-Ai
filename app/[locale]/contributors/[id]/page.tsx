import { notFound } from "next/navigation";
import { ContributorBadge } from "../../../components/ContributorBadge";
import { getAllRegistryBundles } from "../../../../lib/data";
import {
  CONTRIBUTOR_BADGE_POLICY_NOTE,
  calculateContributorBadges,
  emptyContributorGamificationStats,
  type ContributorGamificationStats,
} from "../../../../lib/gamification";
import { SUPPORTED_LOCALES, isValidLocale } from "../../../../lib/i18n";

export const revalidate = 60;

type ContributorPageParams = {
  locale: string;
  id: string;
};

export async function generateStaticParams() {
  const contributors = new Set<string>();

  for (const bundle of getAllRegistryBundles()) {
    for (const claim of bundle.claims) {
      if (claim.status === "verified" && claim.contributor_hash) {
        contributors.add(claim.contributor_hash);
      }

      for (const source of claim.sources) {
        if (source.contributor_hash) {
          contributors.add(source.contributor_hash);
        }
      }

      for (const event of claim.verification_events) {
        if (event.contributor_hash) {
          contributors.add(event.contributor_hash);
        }
      }
    }
  }

  return SUPPORTED_LOCALES.flatMap((locale) =>
    [...contributors].map((id) => ({ locale, id })),
  );
}

function getContributorGamificationStats(contributorHash: string): ContributorGamificationStats {
  const stats = { ...emptyContributorGamificationStats };
  const acceptedCountries = new Set<string>();
  const acceptedCategories = new Set<string>();
  const verifiedClaimIds = new Set<string>();
  const staleFixClaimIds = new Set<string>();

  for (const bundle of getAllRegistryBundles()) {
    for (const claim of bundle.claims) {
      const sourceMatches = claim.sources.filter((source) => source.contributor_hash === contributorHash);
      const eventMatches = claim.verification_events.filter((event) => event.contributor_hash === contributorHash);
      const contributedToClaim = claim.contributor_hash === contributorHash || sourceMatches.length > 0 || eventMatches.length > 0;

      stats.submitted_source_count += sourceMatches.length;

      const acceptedSourceCount = sourceMatches.filter((source) =>
        claim.status === "verified" && source.source_check_status !== "failed",
      ).length;
      stats.accepted_source_count += acceptedSourceCount;

      if (acceptedSourceCount > 0) {
        acceptedCountries.add(bundle.document.country);
        acceptedCategories.add(bundle.document.category);
      }

      if (claim.status === "verified" && contributedToClaim) {
        verifiedClaimIds.add(claim.id);
      }

      for (const event of eventMatches) {
        if (
          event.previous_status === "unknown" &&
          event.new_status === "verified" &&
          event.new_confidence !== "low"
        ) {
          staleFixClaimIds.add(claim.id);
        }
      }
    }
  }

  stats.verified_claim_contribution_count = verifiedClaimIds.size;
  stats.country_coverage_count = acceptedCountries.size;
  stats.category_contribution_count = acceptedCategories.size;
  stats.stale_claim_fix_count = staleFixClaimIds.size;

  return stats;
}

export default async function ContributorPage({
  params,
}: {
  params: Promise<ContributorPageParams>;
}) {
  const { locale, id } = await params;
  if (!isValidLocale(locale)) notFound();

  const contributorHash = decodeURIComponent(id);
  const stats = getContributorGamificationStats(contributorHash);
  const badges = calculateContributorBadges(stats);
  const earnedBadges = badges.filter((badge) => badge.earned);

  return (
    <article>
      <header className="registry-panel">
        <p className="eyebrow">Contributor quality profile</p>
        <h1>Contributor #{contributorHash.slice(0, 12)}</h1>
        <p>{CONTRIBUTOR_BADGE_POLICY_NOTE}</p>
      </header>

      <section className="registry-panel" aria-labelledby="contributor-stats">
        <h2 id="contributor-stats">Contribution metrics</h2>
        <dl className="meta-grid">
          {Object.entries(stats).map(([key, value]) => (
            <div className="meta-item" key={key}>
              <dt className="meta-label">{key}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="registry-panel" aria-labelledby="contributor-badges">
        <h2 id="contributor-badges">Badges ({earnedBadges.length}/{badges.length})</h2>
        <p>
          Badges summarize source submission, accepted source, verified claim, country, category,
          stale-claim fix, and accepted hallucination-report activity. Human reviewers still decide
          whether any claim is verified.
        </p>
      </section>

      <ul className="link-list" style={{ display: "grid", gap: 12, padding: 0, listStyle: "none" }}>
        {badges.map((badge) => (
          <ContributorBadge key={badge.id} badge={badge} />
        ))}
      </ul>
    </article>
  );
}
