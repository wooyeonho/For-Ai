import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getRegistryIndex } from "../../../lib/registry-index";
import { LOCALE_CONFIG, SUPPORTED_LOCALES, isValidLocale } from "../../../lib/i18n";
import type { SupportedLocale } from "../../../lib/i18n";

export const revalidate = 60;

type CountriesPageParams = { locale: string };
type CountrySummary = { country: string; documentCount: number; verifiedCount: number; staleCount: number };

export const metadata: Metadata = {
  title: "Countries — For-Ai",
  description: "Browse the For-Ai claim-level registry by country with verified and stale document counts.",
};

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }));
}

export default async function CountriesPage({ params }: { params: Promise<CountriesPageParams> }) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  const supportedLocale = locale as SupportedLocale;
  const items = await getRegistryIndex();
  const countries = summarizeCountries(items.map((item) => ({
    country: item.country || "GLOBAL",
    canCite: item.can_cite,
    freshness: item.freshness,
  })));

  return (
    <article>
      <header className="registry-panel">
        <p className="eyebrow">Registry navigation</p>
        <h1>Browse countries</h1>
        <p style={{ maxWidth: 760 }}>
          Enter the registry by jurisdiction. Verified counts mean documents that are citation-ready; stale counts flag source-backed facts that should be rechecked before reliance.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <span className="badge">{countries.length} countries</span>
          <span className="badge">{items.length} documents</span>
        </div>
      </header>

      <section className="registry-panel" aria-labelledby="country-list">
        <h2 id="country-list">Country index</h2>
        {countries.length === 0 ? (
          <p className="stat-note">Needs verification: no country registry entries are available yet.</p>
        ) : (
          <ul className="registry-index">
            {countries.map((country) => (
              <li key={country.country} className="registry-row">
                <div className="registry-row-main">
                  <Link href={`/${locale}/country/${country.country.toLowerCase()}`} className="registry-row-title">
                    {countryName(country.country, supportedLocale)}
                  </Link>
                  <span className="registry-row-entity">{country.documentCount} document(s)</span>
                </div>
                <div className="registry-row-meta">
                  <span className="badge badge-verified">{country.verifiedCount} verified</span>
                  <span className="badge badge-warning">{country.staleCount} stale</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <nav className="registry-panel" aria-labelledby="country-language-list">
        <h2 id="country-language-list">Other languages</h2>
        <ul className="link-list" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {SUPPORTED_LOCALES.filter((l) => l !== locale).map((l) => (
            <li key={l}>
              <Link href={`/${l}/countries`}>{LOCALE_CONFIG[l].flag} {LOCALE_CONFIG[l].nativeName}</Link>
            </li>
          ))}
        </ul>
      </nav>
    </article>
  );
}

function summarizeCountries(items: { country: string; canCite: boolean; freshness: string }[]): CountrySummary[] {
  const summaries = new Map<string, CountrySummary>();
  for (const item of items) {
    const country = normalizeCountry(item.country);
    const current = summaries.get(country) ?? { country, documentCount: 0, verifiedCount: 0, staleCount: 0 };
    current.documentCount += 1;
    if (item.canCite) current.verifiedCount += 1;
    if (item.freshness === "stale") current.staleCount += 1;
    summaries.set(country, current);
  }
  return [...summaries.values()].sort((a, b) => b.verifiedCount - a.verifiedCount || b.documentCount - a.documentCount || a.country.localeCompare(b.country));
}

function normalizeCountry(country: string): string {
  return country.trim().toUpperCase() || "GLOBAL";
}

function countryName(country: string, locale: SupportedLocale): string {
  if (country === "GLOBAL") return "Global";
  try {
    const displayNames = new Intl.DisplayNames([locale], { type: "region" });
    return displayNames.of(country) ?? country;
  } catch {
    return country;
  }
}
