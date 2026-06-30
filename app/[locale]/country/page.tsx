import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllRegistryBundles } from "../../../lib/data";
import { SUPPORTED_LOCALES, isValidLocale } from "../../../lib/i18n";

export const revalidate = 300;

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isValidLocale(locale)) return { title: "Countries not found" };
  return {
    title: "Countries — For-Ai",
    description: "Browse jurisdiction-aware For-Ai documents by country.",
    alternates: { languages: Object.fromEntries(SUPPORTED_LOCALES.map((l) => [l, `/${l}/country`])) },
  };
}

export default async function CountriesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  const countries = Array.from(
    getAllRegistryBundles().reduce((map, bundle) => {
      const key = bundle.document.country || bundle.entity.country || "global";
      const existing = map.get(key) ?? { key, count: 0, examples: [] as string[] };
      existing.count += 1;
      if (existing.examples.length < 3) existing.examples.push(bundle.document.title);
      map.set(key, existing);
      return map;
    }, new Map<string, { key: string; count: number; examples: string[] }>()),
  ).map(([, value]) => value).sort((a, b) => a.key.localeCompare(b.key));

  return (
    <article>
      <header className="registry-panel">
        <p className="eyebrow">Explore</p>
        <h1>Countries</h1>
        <p>Find facts by jurisdiction. Unknown or changing country-specific claims remain marked as needs verification until sourced and approved.</p>
      </header>
      <section className="registry-panel" aria-labelledby="country-index">
        <h2 id="country-index">Country index</h2>
        <ul className="registry-index">
          {countries.map((country) => (
            <li key={country.key} className="registry-row">
              <div className="registry-row-main">
                <Link className="registry-row-title" href={`/${locale}/country/${encodeURIComponent(country.key)}`}>{country.key.toUpperCase()}</Link>
                <span className="registry-row-entity">{country.examples.join(" · ")}</span>
              </div>
              <div className="registry-row-meta"><span className="badge">{country.count} docs</span></div>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
