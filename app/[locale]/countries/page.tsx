import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getRegistryIndex, type RegistryIndexItem } from "../../../lib/registry-index";
import { SUPPORTED_LOCALES, isValidLocale } from "../../../lib/i18n";

export const revalidate = 60;

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isValidLocale(locale)) return { title: "Countries not found" };
  return {
    title: "Countries — For-Ai",
    description: "Browse For-Ai registry coverage by country with verified, needs review, and stale counts.",
    alternates: { languages: Object.fromEntries(SUPPORTED_LOCALES.map((l) => [l, `/${l}/countries`])) },
  };
}

type CountrySummary = {
  country: string;
  documents: number;
  verified: number;
  needsReview: number;
  stale: number;
  examples: RegistryIndexItem[];
};

function summarizeCountries(items: RegistryIndexItem[]): CountrySummary[] {
  const groups = new Map<string, CountrySummary>();
  for (const item of items) {
    const country = (item.country || "GLOBAL").toUpperCase();
    const summary = groups.get(country) ?? { country, documents: 0, verified: 0, needsReview: 0, stale: 0, examples: [] };
    summary.documents += 1;
    if (item.can_cite) summary.verified += 1;
    else summary.needsReview += 1;
    if (item.freshness === "stale") summary.stale += 1;
    if (summary.examples.length < 3) summary.examples.push(item);
    groups.set(country, summary);
  }
  return [...groups.values()].sort((a, b) => b.documents - a.documents || a.country.localeCompare(b.country));
}

export default async function CountriesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  const items = await getRegistryIndex({ verification: "all" });
  const countries = summarizeCountries(items);
  const questCountries = countries.filter((country) => country.needsReview > 0 || country.stale > 0).length;

  return (
    <article>
      <header className="registry-panel">
        <p className="eyebrow">Country coverage</p>
        <h1>Browse fact-registry countries</h1>
        <p>
          Country pages show where For-Ai has citable facts, where documents need source review, and where verified claims may be stale.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <span className="badge">{countries.length} countries</span>
          <span className="badge badge-verified">{items.filter((item) => item.can_cite).length} verified documents</span>
          <span className="badge badge-review">{questCountries} country quests open</span>
        </div>
      </header>

      <section className="registry-panel" aria-labelledby="country-quest-cta">
        <p className="eyebrow">Country quest CTA</p>
        <h2 id="country-quest-cta">Adopt an under-covered country</h2>
        <p>
          Help turn needs-review and stale country records into source-backed claims. Contributions suggest evidence; verification remains independent and human-reviewed.
        </p>
        <Link className="cta-link" href={`/${locale}/quests`}>Open country quests</Link>
      </section>

      <section className="registry-panel" aria-labelledby="country-list">
        <h2 id="country-list">Countries</h2>
        <ul className="registry-index">
          {countries.map((country) => (
            <li key={country.country} className="registry-row">
              <div className="registry-row-main">
                <strong className="registry-row-title">{country.country}</strong>
                <span className="registry-row-entity">
                  {country.examples.map((item) => item.title).join(" · ") || "No example documents yet"}
                </span>
              </div>
              <div className="registry-row-meta">
                <span className="badge">{country.documents} documents</span>
                <span className="badge badge-verified">{country.verified} verified</span>
                <span className="badge badge-review">{country.needsReview} needs review</span>
                <span className={country.stale > 0 ? "badge badge-warning" : "badge"}>{country.stale} stale</span>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
