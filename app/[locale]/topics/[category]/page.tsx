import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAllRegistryBundles, isVerifiedClaim } from "../../../../lib/data";
import { getDocumentCitationStatus, isStale } from "../../../../lib/citation-status";
import { LOCALE_CONFIG, SUPPORTED_LOCALES, isValidLocale } from "../../../../lib/i18n";
import type { RegistryDocumentBundle } from "../../../../lib/types";

export const revalidate = 60;

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  visa: "Visa requirements, processing rules, fees, exemptions, and jurisdiction-specific travel authorization claims that frequently change.",
  transport: "Transport fares, schedules, transfer rules, station operations, accessibility, and route facts that AI systems often cite after they become outdated.",
  "government-fees": "Government filing fees, document issuance fees, penalties, renewal costs, and official payment rules that require source-backed verification.",
  "public-services": "Public-service availability, eligibility, operating procedures, documents, locations, and service windows across jurisdictions.",
  "saas-pricing": "SaaS plan limits, pricing tiers, billing terms, enterprise availability, and feature entitlements that change over time.",
  "business-hours": "Opening hours, holiday schedules, exception dates, and location-specific operating facts for places and services.",
  refunds: "Refund windows, cancellation rules, return conditions, charge policies, and consumer-facing commerce terms.",
  education: "Admissions deadlines, tuition, program requirements, scholarship rules, campus services, and education-policy facts.",
  "healthcare-operations": "Healthcare facility operations, service availability, appointment processes, hours, and administrative facts — not medical advice.",
  "travel-rules": "Entry, transit, baggage, customs, transportation, and destination rules that travelers and AI assistants need to verify before citation.",
};

const CATEGORY_ALIASES: Record<string, string[]> = {
  visa: ["visa", "immigration", "travel.visa"],
  transport: ["transport", "transit", "fare", "schedule", "metro", "rail", "bus"],
  "government-fees": ["government-fees", "government", "fee", "administration", "documents"],
  "public-services": ["public-services", "public_service", "civil", "administration"],
  "saas-pricing": ["saas-pricing", "saas", "pricing", "technology"],
  "business-hours": ["business-hours", "hours", "opening", "venue", "food", "dining"],
  refunds: ["refunds", "refund", "returns", "commerce"],
  education: ["education", "admission", "tuition", "school", "university"],
  "healthcare-operations": ["healthcare-operations", "healthcare", "hospital", "clinic", "medical"],
  "travel-rules": ["travel-rules", "travel", "customs", "transit", "baggage"],
};

type TopicParams = { locale: string; category: string };

type CountryGroup = {
  country: string;
  bundles: RegistryDocumentBundle[];
};

export function generateStaticParams() {
  return SUPPORTED_LOCALES.flatMap((locale) =>
    Object.keys(CATEGORY_DESCRIPTIONS).map((category) => ({ locale, category })),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<TopicParams>;
}): Promise<Metadata> {
  const { locale, category } = await params;
  if (!isValidLocale(locale) || !isKnownCategory(category)) return { title: "Topic not found" };

  const title = `${formatCategoryTitle(category)} facts — For-Ai`;
  const description = CATEGORY_DESCRIPTIONS[category];

  return {
    title,
    description,
    alternates: {
      languages: Object.fromEntries(
        SUPPORTED_LOCALES.map((l) => [l, `/${l}/topics/${category}`]),
      ),
    },
  };
}

export default async function TopicCategoryPage({
  params,
}: {
  params: Promise<TopicParams>;
}) {
  const { locale, category } = await params;
  if (!isValidLocale(locale) || !isKnownCategory(category)) notFound();

  const matchingBundles = getBundlesForCategory(category);
  const verifiedBundles = matchingBundles.filter((bundle) => getDocumentCitationStatus(bundle).isVerifiedDocument);
  const needsReviewBundles = matchingBundles.filter((bundle) => !getDocumentCitationStatus(bundle).isVerifiedDocument);
  const staleBundles = matchingBundles.filter((bundle) => getDocumentCitationStatus(bundle).freshness === "stale");
  const countries = groupByCountry(matchingBundles);
  const title = formatCategoryTitle(category);

  return (
    <article>
      <header className="registry-panel">
        <p className="eyebrow">Claim-level topic registry</p>
        <h1>{title} facts</h1>
        <p><strong>Summary:</strong> {CATEGORY_DESCRIPTIONS[category]}</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <span className="badge">{matchingBundles.length} documents</span>
          <span className="badge badge-verified">{verifiedBundles.length} verified</span>
          <span className="badge badge-review">{needsReviewBundles.length} needs review</span>
          <span className="badge badge-warning">{staleBundles.length} stale</span>
        </div>
      </header>

      <section className="registry-panel" aria-labelledby="country-popular-facts">
        <p className="eyebrow">Country index</p>
        <h2 id="country-popular-facts">Popular facts by country</h2>
        {countries.length > 0 ? (
          <div style={{ display: "grid", gap: 16 }}>
            {countries.map((group) => (
              <section key={group.country} aria-labelledby={`country-${group.country}`}>
                <h3 id={`country-${group.country}`} style={{ marginBottom: 8 }}>{group.country}</h3>
                <FactList bundles={group.bundles.slice(0, 5)} locale={locale} />
              </section>
            ))}
          </div>
        ) : (
          <EmptyState
            status="No country-specific facts are registered for this category yet."
            reason="This topic has not received source-backed claims grouped by country."
            action="Submit a missing fact with a traceable source; it will remain Needs verification until human review."
          />
        )}
      </section>

      <section className="registry-panel" aria-labelledby="verified-facts">
        <p className="eyebrow">Citable claims</p>
        <h2 id="verified-facts">Verified facts</h2>
        {verifiedBundles.length > 0 ? (
          <FactList bundles={verifiedBundles.slice(0, 10)} locale={locale} showClaim />
        ) : (
          <EmptyState
            status="No fully verified facts are available in this category yet."
            reason="Claims in this topic still need accepted sources and human approval before citation."
            action="Add an official source or review candidate claims in the needs-review queue."
          />
        )}
      </section>

      <section className="registry-panel" aria-labelledby="needs-review-topics">
        <p className="eyebrow">Verification queue</p>
        <h2 id="needs-review-topics">Needs review topics</h2>
        {needsReviewBundles.length > 0 ? (
          <FactList bundles={needsReviewBundles.slice(0, 10)} locale={locale} />
        ) : (
          <EmptyState
            status="No topics currently need review in this category."
            reason="There are no unverified documents matched to this topic right now."
            action="Submit a missing topic if an important fact is absent."
          />
        )}
      </section>

      <section className="registry-panel" aria-labelledby="stale-facts">
        <p className="eyebrow">Freshness monitoring</p>
        <h2 id="stale-facts">Stale facts</h2>
        {staleBundles.length > 0 ? (
          <FactList bundles={staleBundles.slice(0, 10)} locale={locale} showFreshness />
        ) : (
          <EmptyState
            status="No stale verified facts are flagged in this category."
            reason="Current verified claims are still within their freshness policy or no verified claims exist yet."
            action="Check back later or submit fresher source evidence when a fact changes."
          />
        )}
      </section>

      <section className="registry-panel" aria-labelledby="submit-missing-fact" style={{ background: "#fffbeb", borderInlineStart: "3px solid #f59e0b" }}>
        <p className="eyebrow">Missing fact?</p>
        <h2 id="submit-missing-fact">Submit missing fact</h2>
        <ul className="link-list">
          <li>Public submissions do not require login.</li>
          <li>New facts stay Needs verification until a traceable source is attached.</li>
          <li>Human review is required before the fact can become citation-ready.</li>
        </ul>
        <div style={{ marginTop: 16 }}>
          <Link className="btn btn-primary" href={`/suggest-topic?category=${encodeURIComponent(category)}`}>
            Submit a missing {title.toLowerCase()} fact
          </Link>
        </div>
      </section>

      <nav className="registry-panel" aria-labelledby="topic-languages">
        <h2 id="topic-languages">Other languages</h2>
        <ul className="link-list" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {SUPPORTED_LOCALES.filter((l) => l !== locale).map((l) => (
            <li key={l}>
              <Link href={`/${l}/topics/${category}`}>
                {LOCALE_CONFIG[l].flag} {LOCALE_CONFIG[l].nativeName}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </article>
  );
}

function isKnownCategory(category: string): boolean {
  return Object.prototype.hasOwnProperty.call(CATEGORY_DESCRIPTIONS, category);
}

function formatCategoryTitle(category: string): string {
  return category.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function getBundlesForCategory(category: string): RegistryDocumentBundle[] {
  const aliases = CATEGORY_ALIASES[category] ?? [category];
  return getAllRegistryBundles()
    .filter((bundle) => {
      const haystack = [
        bundle.document.category,
        bundle.document.template,
        bundle.entity.type,
        bundle.document.slug,
        bundle.document.title,
      ].join(" ").toLowerCase();
      return aliases.some((alias) => haystack.includes(alias.toLowerCase()));
    })
    .sort((a, b) => documentRank(a) - documentRank(b) || a.document.title.localeCompare(b.document.title));
}

function documentRank(bundle: RegistryDocumentBundle): number {
  const citationStatus = getDocumentCitationStatus(bundle);
  if (citationStatus.isVerifiedDocument && citationStatus.freshness !== "stale") return 0;
  if (citationStatus.isVerifiedDocument) return 1;
  if (bundle.document.status === "needs_review") return 2;
  return 3;
}

function groupByCountry(bundles: RegistryDocumentBundle[]): CountryGroup[] {
  const groups = new Map<string, RegistryDocumentBundle[]>();
  for (const bundle of bundles) {
    const country = bundle.document.country || bundle.entity.country || "global";
    groups.set(country, [...(groups.get(country) ?? []), bundle]);
  }
  return [...groups.entries()]
    .map(([country, countryBundles]) => ({ country, bundles: countryBundles }))
    .sort((a, b) => a.country.localeCompare(b.country));
}

function FactList({
  bundles,
  locale,
  showClaim = false,
  showFreshness = false,
}: {
  bundles: RegistryDocumentBundle[];
  locale: string;
  showClaim?: boolean;
  showFreshness?: boolean;
}) {
  return (
    <ul className="registry-index">
      {bundles.map((bundle) => {
        const citationStatus = getDocumentCitationStatus(bundle);
        const firstVerifiedClaim = bundle.claims.find(isVerifiedClaim);
        return (
          <li key={bundle.document.slug} className="registry-row">
            <div className="registry-row-main">
              <Link href={`/${locale}/wiki/${bundle.document.slug}`} className="registry-row-title">
                {bundle.document.title}
              </Link>
              <span className="registry-row-entity">
                {bundle.entity.canonical_name} · {bundle.document.country || bundle.entity.country || "global"}
              </span>
              {showClaim && firstVerifiedClaim ? (
                <span className="meta-label">{firstVerifiedClaim.claim_text}: {firstVerifiedClaim.claim_value}</span>
              ) : null}
            </div>
            <div className="registry-row-meta">
              <span className={citationStatus.isVerifiedDocument ? "badge badge-verified" : "badge badge-review"}>
                {citationStatus.label}
              </span>
              <span className={`badge badge-${bundle.document.confidence}`}>{bundle.document.confidence}</span>
              {showFreshness ? (
                <span className={citationStatus.freshness === "stale" || isStale(bundle.document.last_verified_at) ? "badge badge-warning" : "badge"}>
                  {citationStatus.oldestVerifiedAt ? `oldest: ${citationStatus.oldestVerifiedAt}` : "verification date needed"}
                </span>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function EmptyState({ status, reason, action }: { status: string; reason: string; action: string }) {
  return (
    <div className="stat-note" role="status">
      <p><strong>Current status:</strong> {status}</p>
      <p><strong>Why it is empty:</strong> {reason}</p>
      <p><strong>Next action:</strong> {action}</p>
    </div>
  );
}
