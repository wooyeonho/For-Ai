import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getRegistryIndex, type RegistryIndexItem } from "../../../lib/registry-index";
import { SUPPORTED_LOCALES, isValidLocale } from "../../../lib/i18n";
import type { SupportedLocale } from "../../../lib/i18n";

export const revalidate = 60;

type CountriesPageParams = { locale: string };

type CountrySummary = {
  country: string;
  name: string;
  documents: number;
  staleClaims: number;
  verifiedClaims: number;
  needsReviewClaims: number;
};

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<CountriesPageParams>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isValidLocale(locale)) return { title: "Countries not found" };

  return {
    title: "Countries | For-Ai",
    description:
      "Browse For-Ai country registry coverage with document counts, stale claim counts, and contributor entry points.",
    alternates: {
      languages: Object.fromEntries(SUPPORTED_LOCALES.map((l) => [l, `/${l}/countries`])),
    },
  };
}

export default async function CountriesIndexPage({
  params,
}: {
  params: Promise<CountriesPageParams>;
}) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  const supportedLocale = locale as SupportedLocale;
  const items = await getRegistryIndex();
  const countries = buildCountrySummaries(items, supportedLocale);
  const totals = countries.reduce(
    (acc, country) => ({
      documents: acc.documents + country.documents,
      staleClaims: acc.staleClaims + country.staleClaims,
      verifiedClaims: acc.verifiedClaims + country.verifiedClaims,
      needsReviewClaims: acc.needsReviewClaims + country.needsReviewClaims,
    }),
    { documents: 0, staleClaims: 0, verifiedClaims: 0, needsReviewClaims: 0 },
  );

  return (
    <article>
      <header className="registry-panel">
        <p className="eyebrow">Country coverage</p>
        <h1>Browse facts by country</h1>
        <p style={{ maxWidth: 760 }}>
          Open country-level registry dashboards for documents, stale facts, source needs, and contributor queues. Stale or unknown claims are not citation-ready until re-verified from traceable sources.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <span className="badge">{countries.length} countries</span>
          <span className="badge">{totals.documents} documents</span>
          <span className="badge badge-warning">{totals.staleClaims} stale claims</span>
          <span className="badge badge-review">{totals.needsReviewClaims} needs review</span>
        </div>
      </header>

      <section className="registry-panel" aria-labelledby="country-list">
        <h2 id="country-list">Country index</h2>
        {countries.length === 0 ? (
          <p className="stat-note">No country registry rows are available yet.</p>
        ) : (
          <div className="audience-grid">
            {countries.map((country) => {
              const hrefCountry = country.country.toLowerCase();
              const contributorHref = `/suggest-topic?country=${encodeURIComponent(country.country)}&lang=${encodeURIComponent(locale)}`;
              return (
                <article key={country.country} className="audience-card">
                  <p className="eyebrow">{country.country}</p>
                  <h3>
                    <Link href={`/${locale}/country/${encodeURIComponent(hrefCountry)}`}>{country.name}</Link>
                  </h3>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                    <span className="badge">{country.documents} documents</span>
                    <span className="badge badge-verified">{country.verifiedClaims} verified claims</span>
                    <span className="badge badge-warning">{country.staleClaims} stale claims</span>
                    <span className="badge badge-review">{country.needsReviewClaims} needs review</span>
                  </div>
                  <div className="audience-links" style={{ marginTop: 14 }}>
                    <Link href={`/${locale}/country/${encodeURIComponent(hrefCountry)}`} className="text-link">Open country registry</Link>
                    <Link href={contributorHref} className="text-link">Contribute a source</Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </article>
  );
}

function buildCountrySummaries(items: RegistryIndexItem[], locale: SupportedLocale): CountrySummary[] {
  const groups = new Map<string, RegistryIndexItem[]>();
  for (const item of items) {
    const country = (item.country || "global").toUpperCase();
    groups.set(country, [...(groups.get(country) ?? []), item]);
  }

  return [...groups.entries()]
    .map(([country, countryItems]) => {
      const verifiedClaims = countryItems.reduce((sum, item) => sum + item.verified_claims, 0);
      const totalClaims = countryItems.reduce((sum, item) => sum + item.total_claims, 0);
      return {
        country,
        name: countryName(country, locale),
        documents: countryItems.length,
        staleClaims: countryItems.reduce((sum, item) => sum + (item.freshness === "stale" ? item.verified_claims : 0), 0),
        verifiedClaims,
        needsReviewClaims: Math.max(0, totalClaims - verifiedClaims),
      };
    })
    .sort((a, b) => b.documents - a.documents || a.name.localeCompare(b.name));
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
