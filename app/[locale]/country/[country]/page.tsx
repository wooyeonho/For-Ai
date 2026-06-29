import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAllRegistryBundles } from "../../../../lib/data";
import { getDocumentCitationStatus } from "../../../../lib/citation-status";
import { SUPPORTED_LOCALES, isValidLocale } from "../../../../lib/i18n";
import type { RegistryDocumentBundle } from "../../../../lib/types";

export const revalidate = 60;

const COUNTRY_NAMES: Record<string, string> = {
  AR: "Argentina",
  AU: "Australia",
  BR: "Brazil",
  CA: "Canada",
  CN: "China",
  DE: "Germany",
  ES: "Spain",
  FR: "France",
  GB: "United Kingdom",
  GLOBAL: "Global",
  IN: "India",
  JP: "Japan",
  KR: "South Korea",
  MX: "Mexico",
  US: "United States",
};

function normalizeCountry(country: string): string {
  const normalized = decodeURIComponent(country).trim().replace(/[^a-z0-9-]/gi, "").toUpperCase();
  if (normalized === "UK") return "GB";
  if (normalized === "GLOBAL") return "GLOBAL";
  return normalized;
}

function getCountryLabel(countryCode: string): string {
  return COUNTRY_NAMES[countryCode] ?? countryCode;
}

function bundleCountry(bundle: RegistryDocumentBundle): string {
  return normalizeCountry(bundle.document.country || bundle.entity.country || "global");
}

function countryBundles(countryCode: string): RegistryDocumentBundle[] {
  return getAllRegistryBundles().filter((bundle) => bundleCountry(bundle) === countryCode);
}

function factsNeedingReview(bundle: RegistryDocumentBundle) {
  return bundle.claims.filter((claim) => claim.status === "needs_review" || claim.confidence === "low");
}

function verifiedCorrections(bundle: RegistryDocumentBundle) {
  return bundle.claims.filter((claim) => claim.status === "verified" && claim.sources.length > 0);
}

function uniqueCountries(): string[] {
  return [...new Set(getAllRegistryBundles().map(bundleCountry))].filter(Boolean);
}

export async function generateStaticParams() {
  const countries = uniqueCountries();
  return SUPPORTED_LOCALES.flatMap((locale) => countries.map((country) => ({ locale, country: country.toLowerCase() })));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; country: string }>;
}): Promise<Metadata> {
  const { locale, country } = await params;
  if (!isValidLocale(locale)) return { title: "Not found" };
  const countryCode = normalizeCountry(country);
  const countryName = getCountryLabel(countryCode);

  return {
    title: `AI gets these facts wrong in ${countryName}`,
    description: `Help verify claim-level facts, stale facts, hallucination reports, and corrections for ${countryName}.`,
  };
}

export default async function CountryWrongFactsPage({
  params,
}: {
  params: Promise<{ locale: string; country: string }>;
}) {
  const { locale, country } = await params;
  if (!isValidLocale(locale)) notFound();

  const countryCode = normalizeCountry(country);
  const countryName = getCountryLabel(countryCode);
  const bundles = countryBundles(countryCode);
  const reviewItems = bundles.flatMap((bundle) => factsNeedingReview(bundle).map((claim) => ({ bundle, claim })));
  const staleBundles = bundles.filter((bundle) => getDocumentCitationStatus(bundle).freshness === "stale");
  const correctionItems = bundles.flatMap((bundle) => verifiedCorrections(bundle).map((claim) => ({ bundle, claim })));

  return (
    <article>
      <header className="registry-panel">
        <p className="eyebrow">Country AI wrong facts</p>
        <h1>AI gets these facts wrong in {countryName}</h1>
        <p>
          Help verify facts for {countryName}. This page groups claim-level facts that need human review,
          stale citation candidates, hallucination report entry points, and source-backed corrections.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <span className="badge">{countryCode}</span>
          <span className="badge badge-review">needs_review: {reviewItems.length}</span>
          <span className="badge badge-warning">stale: {staleBundles.length}</span>
          <span className="badge badge-verified">verified corrections: {correctionItems.length}</span>
        </div>
      </header>

      <section className="registry-panel" aria-labelledby="needs-review-facts">
        <h2 id="needs-review-facts">Country needs_review facts</h2>
        {reviewItems.length === 0 ? (
          <p className="meta-label">No country-specific needs_review facts are currently in the static registry.</p>
        ) : (
          <ul className="link-list">
            {reviewItems.slice(0, 12).map(({ bundle, claim }) => (
              <li key={claim.id}>
                <Link href={`/${locale}/wiki/${bundle.document.slug}`}>{bundle.document.title}</Link>{" "}
                <span className="badge badge-review">{claim.status}</span>{" "}
                <span className="badge badge-low">{claim.confidence}</span>
                <br />
                <span className="meta-label">{claim.field_path}</span> — {claim.claim_text}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="registry-panel" aria-labelledby="stale-facts">
        <h2 id="stale-facts">Stale facts</h2>
        {staleBundles.length === 0 ? (
          <p className="meta-label">No stale verified facts are currently flagged for this country.</p>
        ) : (
          <ul className="link-list">
            {staleBundles.slice(0, 12).map((bundle) => {
              const status = getDocumentCitationStatus(bundle);
              return (
                <li key={bundle.document.id}>
                  <Link href={`/${locale}/wiki/${bundle.document.slug}`}>{bundle.document.title}</Link>{" "}
                  <span className="badge badge-warning">stale</span>
                  <br />
                  <span className="meta-label">oldest verified at: {status.oldestVerifiedAt ?? "Needs verification"}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="registry-panel" aria-labelledby="hallucination-reports">
        <h2 id="hallucination-reports">Hallucination reports</h2>
        <p>
          Hallucination reports are intake records and are not publicly readable. Use the document links below to
          report an AI answer that conflicts with a claim-level registry item for {countryName}.
        </p>
        {bundles.length === 0 ? (
          <p className="meta-label">No country documents are currently available for hallucination reporting.</p>
        ) : (
          <ul className="link-list">
            {bundles.slice(0, 8).map((bundle) => (
              <li key={bundle.document.id}>
                <Link href={`/hallucination/${bundle.document.slug}`}>Report AI hallucination: {bundle.document.title}</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="registry-panel" aria-labelledby="verified-corrections">
        <h2 id="verified-corrections">Verified corrections</h2>
        {correctionItems.length === 0 ? (
          <p className="meta-label">No source-backed verified corrections are currently available for this country.</p>
        ) : (
          <ul className="link-list">
            {correctionItems.slice(0, 12).map(({ bundle, claim }) => (
              <li key={claim.id}>
                <Link href={`/${locale}/wiki/${bundle.document.slug}`}>{bundle.document.title}</Link>{" "}
                <span className="badge badge-verified">verified</span>
                <br />
                <span className="meta-label">{claim.field_path}</span> — {claim.claim_value}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="registry-panel" aria-labelledby="submit-local-source">
        <h2 id="submit-local-source">Submit local source CTA</h2>
        <p>
          Know an official local source for {countryName}? Submit it so a human reviewer can verify the relevant
          claim before AI systems cite it.
        </p>
        <p>
          <Link href={`/suggest-topic?country=${encodeURIComponent(countryCode)}`}>Submit a local source for {countryName}</Link>
        </p>
      </section>
    </article>
  );
}
