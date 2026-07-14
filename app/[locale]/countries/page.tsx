import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getRegistryIndex, type RegistryIndexItem } from "../../../lib/registry-index";
import { SUPPORTED_LOCALES, isValidLocale, type SupportedLocale } from "../../../lib/i18n";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Countries registry index | For-Ai",
  description:
    "Explore For-Ai registry coverage by country, including document counts, verified claim counts, stale claim counts, and country quest calls to action.",
};

type CountrySummary = {
  code: string;
  name: string;
  documentCount: number;
  verifiedClaimCount: number;
  staleClaimCount: number;
  needsReviewClaimCount: number;
  latestUpdatedAt: string | null;
};

function normalizeCountry(country: string): string {
  const value = country.trim();
  return value ? value.toUpperCase() : "GLOBAL";
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

function dateLabel(value: string | null): string {
  if (!value) return "Needs verification";
  return value.slice(0, 10);
}

function staleClaimCount(item: RegistryIndexItem): number {
  if (item.freshness !== "stale") return 0;
  return Math.max(item.verified_claims, 0);
}

function buildCountrySummaries(items: RegistryIndexItem[], locale: SupportedLocale): CountrySummary[] {
  const summaries = new Map<string, Omit<CountrySummary, "name">>();

  for (const item of items) {
    const code = normalizeCountry(item.country);
    const current = summaries.get(code) ?? {
      code,
      documentCount: 0,
      verifiedClaimCount: 0,
      staleClaimCount: 0,
      needsReviewClaimCount: 0,
      latestUpdatedAt: null,
    };

    current.documentCount += 1;
    current.verifiedClaimCount += item.verified_claims;
    current.staleClaimCount += staleClaimCount(item);
    current.needsReviewClaimCount += Math.max(0, item.total_claims - item.verified_claims);

    const candidateDate = item.updated_at ?? item.last_verified_at;
    if (candidateDate && (!current.latestUpdatedAt || Date.parse(candidateDate) > Date.parse(current.latestUpdatedAt))) {
      current.latestUpdatedAt = candidateDate;
    }

    summaries.set(code, current);
  }

  return [...summaries.values()]
    .map((summary) => ({ ...summary, name: countryName(summary.code, locale) }))
    .sort(
      (a, b) =>
        b.verifiedClaimCount - a.verifiedClaimCount ||
        b.documentCount - a.documentCount ||
        a.name.localeCompare(b.name, locale),
    );
}

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }));
}

export default async function CountriesRegistryPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  const supportedLocale = locale as SupportedLocale;
  const items = await getRegistryIndex();
  const countries = buildCountrySummaries(items, supportedLocale);
  const totals = countries.reduce(
    (acc, country) => ({
      documents: acc.documents + country.documentCount,
      verifiedClaims: acc.verifiedClaims + country.verifiedClaimCount,
      staleClaims: acc.staleClaims + country.staleClaimCount,
    }),
    { documents: 0, verifiedClaims: 0, staleClaims: 0 },
  );

  return (
    <article>
      <header className="registry-panel">
        <p className="eyebrow">Explore registry coverage</p>
        <h1>Countries</h1>
        <p style={{ maxWidth: 760 }}>
          Browse For-Ai coverage by country. Every count is derived from claim-level registry index rows, so country
          discovery stays aligned with source-backed documents, verified claims, and freshness status.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <span className="badge">Countries: {countries.length}</span>
          <span className="badge">Documents: {totals.documents}</span>
          <span className="badge badge-verified">Verified claims: {totals.verifiedClaims}</span>
          <span className="badge badge-review">Stale claims: {totals.staleClaims}</span>
        </div>
      </header>

      <section className="registry-panel" aria-labelledby="country-list">
        <h2 id="country-list">Country registry index</h2>
        {countries.length === 0 ? (
          <p>Needs verification</p>
        ) : (
          <ul className="link-list">
            {countries.map((country) => {
              const countryHref = `/${locale}/country/${country.code.toLowerCase()}`;
              const coverageHref = `/suggest-topic?country=${encodeURIComponent(country.code)}&lang=${encodeURIComponent(locale)}`;

              return (
                <li key={country.code} style={{ paddingBlock: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <Link href={countryHref}><strong>{country.name}</strong></Link>
                      <div className="meta-label">{country.code} · last updated {dateLabel(country.latestUpdatedAt)}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <span className="badge">{country.documentCount} documents</span>
                      <span className="badge badge-verified">{country.verifiedClaimCount} verified claims</span>
                      <span className="badge badge-review">{country.staleClaimCount} stale claims</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                    <Link className="button button-secondary" href={countryHref}>View coverage</Link>
                    <Link className="button" href={coverageHref}>Submit source</Link>
                  </div>
                  {country.needsReviewClaimCount > 0 ? (
                    <p className="meta-label" style={{ marginTop: 8 }}>
                      {country.needsReviewClaimCount} claim(s) still need source-backed human verification.
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </article>
  );
}
