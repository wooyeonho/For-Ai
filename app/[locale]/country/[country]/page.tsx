import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAllRegistryBundles } from "../../../../lib/data";
import { getClaimCitationStatus, getDocumentCitationStatus } from "../../../../lib/citation-status";
import { getRegistryIndex, type RegistryIndexItem } from "../../../../lib/registry-index";
import { SUPPORTED_LOCALES, getTranslations, isValidLocale } from "../../../../lib/i18n";
import type { SupportedLocale } from "../../../../lib/i18n";

export const revalidate = 60;

type CountryPageParams = {
  locale: string;
  country: string;
};

type CountryClaim = {
  id: string;
  text: string;
  value: string;
  documentTitle: string;
  documentSlug: string;
  category: string;
  lastVerifiedAt: string | null;
};

type CategoryProgress = {
  category: string;
  verified: number;
  target: number;
  stale: number;
};

type RecentContributor = {
  hash: string;
  count: number;
  lastSeenAt: string | null;
};


function normalizeCountry(country: string): string {
  return decodeURIComponent(country).trim().toUpperCase();
}

function countryName(country: string, locale: SupportedLocale): string {
  if (country.toLowerCase() === "global") return "Global";

  try {
    const displayNames = new Intl.DisplayNames([locale], { type: "region" });
    return displayNames.of(country) ?? country;
  } catch {
    return country;
  }
}

function dateLabel(value: string | null, fallback = "Needs verification"): string {
  if (!value) return fallback;
  return value.slice(0, 10);
}

function collectCountryClaims(country: string): CountryClaim[] {
  return getAllRegistryBundles()
    .filter((bundle) => bundle.entity.country.toLowerCase() === country.toLowerCase())
    .flatMap((bundle) =>
      bundle.claims
        .filter(
          (claim) =>
            claim.status === "verified" &&
            claim.confidence !== "low" &&
            claim.claim_value !== "확인 필요" &&
            claim.sources.length > 0,
        )
        .map((claim) => ({
          id: claim.id,
          text: claim.claim_text,
          value: claim.claim_value,
          documentTitle: bundle.document.title,
          documentSlug: bundle.document.slug,
          category: bundle.document.category,
          lastVerifiedAt: claim.last_verified_at,
        })),
    )
    .sort((a, b) => Date.parse(b.lastVerifiedAt ?? "") - Date.parse(a.lastVerifiedAt ?? ""));
}

function popularQuestionsFor(items: RegistryIndexItem[]): string[] {
  return items.slice(0, 6).map((item) => item.title);
}

function percent(value: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(100, Math.round((value / target) * 100));
}

function displayContributorHash(hash: string): string {
  return hash.length > 14 ? `${hash.slice(0, 10)}…` : hash;
}

function sourceNeedLabel(category: string, fieldPath: string): string {
  if (/visa|travel|immigration|entry/.test(`${category} ${fieldPath}`)) return "Official immigration or regulator source";
  if (/government|gov|passport|resident|license|fee|tax/.test(`${category} ${fieldPath}`)) return "Official government source";
  if (/transport|transit|metro|fare|rail|bus/.test(`${category} ${fieldPath}`)) return "Official operator fare/rule source";
  if (/commerce|refund|return|shipping|price/.test(`${category} ${fieldPath}`)) return "Official merchant/platform policy source";
  if (/finance|bank|rate|loan|card/.test(`${category} ${fieldPath}`)) return "Official financial institution/regulator source";
  return "Traceable primary source";
}

function buildCountryQuestStats(country: string, items: RegistryIndexItem[]) {
  const countryBundles = getAllRegistryBundles().filter((bundle) => bundle.entity.country.toLowerCase() === country.toLowerCase());
  const byCategory = new Map<string, CategoryProgress>();
  const neededSources = new Map<string, number>();
  const contributors = new Map<string, RecentContributor>();

  const verifiedClaims = items.reduce((sum, item) => sum + item.verified_claims, 0);
  let targetClaims = items.reduce((sum, item) => sum + item.total_claims, 0);
  let staleClaims = items.reduce((sum, item) => sum + (item.freshness === "stale" ? item.verified_claims : 0), 0);

  for (const item of items) {
    const category = item.type || "uncategorized";
    const current = byCategory.get(category) ?? { category, verified: 0, target: 0, stale: 0 };
    current.verified += item.verified_claims;
    current.target += item.total_claims;
    current.stale += item.freshness === "stale" ? item.verified_claims : 0;
    byCategory.set(category, current);
  }

  for (const bundle of countryBundles) {
    const documentStatus = getDocumentCitationStatus(bundle);
    staleClaims += Math.max(0, documentStatus.staleClaims.length - (documentStatus.freshness === "stale" ? documentStatus.verifiedClaims : 0));

    for (const claim of bundle.claims) {
      const claimStatus = getClaimCitationStatus(claim, documentStatus.freshnessPolicy.ttlDays);
      if (!claimStatus.isCitationReady || claim.sources.length === 0) {
        const label = sourceNeedLabel(bundle.document.category || bundle.entity.type, claim.field_path);
        neededSources.set(label, (neededSources.get(label) ?? 0) + 1);
      }

      for (const source of claim.sources) {
        if (!source.contributor_hash) continue;
        const existing = contributors.get(source.contributor_hash) ?? { hash: source.contributor_hash, count: 0, lastSeenAt: null };
        existing.count += 1;
        if (source.created_at && (!existing.lastSeenAt || Date.parse(source.created_at) > Date.parse(existing.lastSeenAt))) {
          existing.lastSeenAt = source.created_at;
        }
        contributors.set(source.contributor_hash, existing);
      }

      for (const event of claim.verification_events) {
        if (!event.contributor_hash) continue;
        const existing = contributors.get(event.contributor_hash) ?? { hash: event.contributor_hash, count: 0, lastSeenAt: null };
        existing.count += 1;
        if (event.created_at && (!existing.lastSeenAt || Date.parse(event.created_at) > Date.parse(existing.lastSeenAt))) {
          existing.lastSeenAt = event.created_at;
        }
        contributors.set(event.contributor_hash, existing);
      }
    }
  }

  targetClaims = Math.max(targetClaims, verifiedClaims);

  return {
    verifiedClaims,
    needsReviewClaims: Math.max(0, targetClaims - verifiedClaims),
    staleClaims,
    targetClaims,
    categoryProgress: [...byCategory.values()].sort((a, b) => b.target - a.target || a.category.localeCompare(b.category)),
    neededSources: [...neededSources.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 6),
    contributors: [...contributors.values()].sort((a, b) => Date.parse(b.lastSeenAt ?? "") - Date.parse(a.lastSeenAt ?? "") || b.count - a.count).slice(0, 6),
  };
}

export async function generateStaticParams() {
  const countries = [...new Set(getAllRegistryBundles().map((b) => b.entity.country.toLowerCase()))];
  return SUPPORTED_LOCALES.flatMap((locale) => countries.map((country) => ({ locale, country })));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<CountryPageParams>;
}): Promise<Metadata> {
  const { locale, country } = await params;
  if (!isValidLocale(locale)) return { title: "Not found" };

  const normalizedCountry = normalizeCountry(country);
  const name = countryName(normalizedCountry, locale as SupportedLocale);
  return {
    title: `${name} fact registry | For-Ai`,
    description: `Country-level For-Ai registry index for ${name}: verified documents, review queue, categories, stale facts, and source-backed claims.`,
  };
}

export default async function CountryRegistryPage({
  params,
}: {
  params: Promise<CountryPageParams>;
}) {
  const { locale, country } = await params;
  if (!isValidLocale(locale)) notFound();

  const supportedLocale = locale as SupportedLocale;
  const normalizedCountry = normalizeCountry(country);
  const items = await getRegistryIndex({ country: normalizedCountry });
  const name = countryName(normalizedCountry, supportedLocale);
  const questStats = buildCountryQuestStats(normalizedCountry, items);
  const overallProgress = percent(questStats.verifiedClaims, questStats.targetClaims);
  const recentFacts = collectCountryClaims(normalizedCountry).slice(0, 8);
  const staleFacts = items.filter((item) => item.freshness === "stale").slice(0, 8);
  const popularQuestions = popularQuestionsFor(items);
  const submitTopicHref = `/suggest-topic?country=${encodeURIComponent(normalizedCountry)}&lang=${encodeURIComponent(locale)}`;
  const t = getTranslations(supportedLocale);
  const unknownLabel = t.country.needsVerification;

  return (
    <article>
      <header className="registry-panel">
        <p className="eyebrow">{t.country.countryRegistry}</p>
        <h1>{name}</h1>
        <p style={{ maxWidth: 760 }}>
          {t.country.dashboardDescription}
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <span className="badge badge-verified">{t.country.verifiedFacts}: {questStats.verifiedClaims}</span>
          <span className="badge badge-review">{t.country.needsReviewFacts}: {questStats.needsReviewClaims}</span>
          <span className="badge">{t.country.staleFacts}: {questStats.staleClaims}</span>
          <span className="badge">{t.country.targetFacts}: {questStats.targetClaims}</span>
        </div>
      </header>

      <section className="registry-panel" aria-labelledby="country-progress">
        <p className="eyebrow">{t.country.questProgress}</p>
        <h2 id="country-progress">{overallProgress}% {t.country.currentCountryTarget}</h2>
        <p className="meta-label">Progress = verified claims / target claims. It is a participation signal only; it never replaces source quality, confidence, freshness, or human verification.</p>
        <div aria-label={`Overall progress ${overallProgress}%`} style={{ background: "#e5e7eb", borderRadius: 999, height: 12, overflow: "hidden", marginTop: 12 }}>
          <div style={{ width: `${overallProgress}%`, background: "#2563eb", height: "100%" }} />
        </div>
      </section>

      <section className="registry-panel" aria-labelledby="country-categories">
        <h2 id="country-categories">{t.country.categoryProgress}</h2>
        {questStats.categoryProgress.length === 0 ? (
          <p>{unknownLabel}</p>
        ) : (
          <ul className="link-list">
            {questStats.categoryProgress.map((category) => {
              const categoryPercent = percent(category.verified, category.target);
              return (
                <li key={category.category}>
                  <strong>{category.category}</strong>: {category.verified}/{category.target} verified ({categoryPercent}%)
                  {category.stale > 0 ? <span className="meta-label"> · {category.stale} stale</span> : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="registry-panel" aria-labelledby="needed-sources">
        <h2 id="needed-sources">{t.country.topNeededSources}</h2>
        {questStats.neededSources.length === 0 ? (
          <p>{t.country.noMissingSources}</p>
        ) : (
          <ul className="link-list">
            {questStats.neededSources.map((source) => (
              <li key={source.label}>{source.label}<span className="meta-label"> · {source.count} {t.country.claimCount}</span></li>
            ))}
          </ul>
        )}
      </section>

      <section className="registry-panel" aria-labelledby="recent-contributors">
        <h2 id="recent-contributors">{t.country.recentContributors}</h2>
        {questStats.contributors.length === 0 ? (
          <p>{t.country.noContributors}</p>
        ) : (
          <ul className="link-list">
            {questStats.contributors.map((contributor) => (
              <li key={contributor.hash}>
                <code>{displayContributorHash(contributor.hash)}</code>
                <span className="meta-label"> · {contributor.count} {t.country.contributions} · {t.country.lastSeen} {dateLabel(contributor.lastSeenAt, unknownLabel)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="registry-panel" aria-labelledby="recent-facts">
        <h2 id="recent-facts">{t.country.recentlyVerifiedFacts}</h2>
        {recentFacts.length === 0 ? (
          <p>{unknownLabel}</p>
        ) : (
          <ul className="link-list">
            {recentFacts.map((fact) => (
              <li key={fact.id}>
                <Link href={`/${locale}/wiki/${fact.documentSlug}`}>{fact.documentTitle}</Link>: {fact.value}
                <span className="meta-label"> · {dateLabel(fact.lastVerifiedAt, unknownLabel)} · {fact.category}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="registry-panel" aria-labelledby="stale-facts">
        <h2 id="stale-facts">{t.country.staleFacts}</h2>
        {staleFacts.length === 0 ? (
          <p>{t.country.noStaleFacts}</p>
        ) : (
          <ul className="link-list">
            {staleFacts.map((item) => (
              <li key={item.slug}>
                <Link href={`/${locale}/wiki/${item.slug}`}>{item.title}</Link>
                <span className="meta-label"> · {t.country.oldestVerified}: {dateLabel(item.oldest_verified_at, unknownLabel)} · {item.type}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="registry-panel" aria-labelledby="popular-questions">
        <h2 id="popular-questions">{t.country.popularQuestions}</h2>
        {popularQuestions.length === 0 ? (
          <p>{unknownLabel}</p>
        ) : (
          <ul className="link-list">
            {popularQuestions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="registry-panel" aria-labelledby="country-documents">
        <h2 id="country-documents">{t.country.documents}</h2>
        {items.length === 0 ? (
          <p>{unknownLabel}</p>
        ) : (
          <ul className="link-list">
            {items.map((item) => (
              <li key={`${item.source}-${item.slug}`}>
                <Link href={`/${locale}/wiki/${item.slug}`}>{item.title}</Link>{" "}
                <span className={item.can_cite ? "badge badge-verified" : "badge badge-review"}>
                  {item.can_cite ? t.country.verified : t.country.needsReview}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="registry-panel" style={{ background: "#f8fafc", borderInlineStart: "3px solid #2563eb" }}>
        <p className="eyebrow">Submit source CTA</p>
        <h2>Know an official source for a needed {name} fact?</h2>
        <p>Submit a source or topic for {name}. Public submissions start as needs-review candidates and must be human verified before citation.</p>
        <Link className="button" href={submitTopicHref}>{t.country.submitSource}</Link>
      </section>
    </article>
  );
}
