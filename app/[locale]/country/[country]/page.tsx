import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAllRegistryBundles } from "../../../../lib/data";
import { getRegistryIndex, type RegistryIndexItem } from "../../../../lib/registry-index";
import { SUPPORTED_LOCALES, isValidLocale } from "../../../../lib/i18n";
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

const UNKNOWN_LABELS: Record<SupportedLocale, string> = {
  ko: "확인 필요",
  en: "Needs verification",
  hi: "सत्यापन आवश्यक",
  ar: "يحتاج إلى تحقق",
  es: "Necesita verificación",
  ja: "確認が必要",
  zh: "需要验证",
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

function dateLabel(value: string | null): string {
  if (!value) return "Needs verification";
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
  const verifiedDocuments = items.filter((item) => item.can_cite);
  const needsReviewDocuments = items.filter((item) => !item.can_cite);
  const categories = [...new Set(items.map((item) => item.type || "uncategorized"))].sort();
  const recentFacts = collectCountryClaims(normalizedCountry).slice(0, 8);
  const staleFacts = items.filter((item) => item.freshness === "stale").slice(0, 8);
  const popularQuestions = popularQuestionsFor(items);
  const submitTopicHref = `/suggest-topic?country=${encodeURIComponent(normalizedCountry)}&lang=${encodeURIComponent(locale)}`;
  const unknownLabel = UNKNOWN_LABELS[supportedLocale];

  return (
    <article>
      <header className="registry-panel">
        <p className="eyebrow">Country registry</p>
        <h1>{name}</h1>
        <p style={{ maxWidth: 760 }}>
          A static-first country dashboard for source-backed For-Ai documents. Counts are derived from the registry index;
          Supabase-backed rows can be included when the optional index connection is configured.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <span className="badge badge-verified">Verified documents: {verifiedDocuments.length}</span>
          <span className="badge badge-review">Needs review: {needsReviewDocuments.length}</span>
          <span className="badge">Categories: {categories.length}</span>
        </div>
      </header>

      <section className="registry-panel" aria-labelledby="country-categories">
        <h2 id="country-categories">Categories</h2>
        {categories.length === 0 ? (
          <p>{unknownLabel}</p>
        ) : (
          <ul className="link-list" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {categories.map((category) => (
              <li key={category}><span className="badge">{category}</span></li>
            ))}
          </ul>
        )}
      </section>

      <section className="registry-panel" aria-labelledby="recent-facts">
        <h2 id="recent-facts">Recently verified facts</h2>
        {recentFacts.length === 0 ? (
          <p>{unknownLabel}</p>
        ) : (
          <ul className="link-list">
            {recentFacts.map((fact) => (
              <li key={fact.id}>
                <Link href={`/${locale}/wiki/${fact.documentSlug}`}>{fact.documentTitle}</Link>: {fact.value}
                <span className="meta-label"> · {dateLabel(fact.lastVerifiedAt)} · {fact.category}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="registry-panel" aria-labelledby="stale-facts">
        <h2 id="stale-facts">Stale facts</h2>
        {staleFacts.length === 0 ? (
          <p>No stale facts in this country index.</p>
        ) : (
          <ul className="link-list">
            {staleFacts.map((item) => (
              <li key={item.slug}>
                <Link href={`/${locale}/wiki/${item.slug}`}>{item.title}</Link>
                <span className="meta-label"> · oldest verified: {dateLabel(item.oldest_verified_at)} · {item.type}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="registry-panel" aria-labelledby="popular-questions">
        <h2 id="popular-questions">Popular questions</h2>
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
        <h2 id="country-documents">Documents</h2>
        {items.length === 0 ? (
          <p>{unknownLabel}</p>
        ) : (
          <ul className="link-list">
            {items.map((item) => (
              <li key={`${item.source}-${item.slug}`}>
                <Link href={`/${locale}/wiki/${item.slug}`}>{item.title}</Link>{" "}
                <span className={item.can_cite ? "badge badge-verified" : "badge badge-review"}>
                  {item.can_cite ? "verified" : "needs review"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="registry-panel" style={{ background: "#f8fafc", borderInlineStart: "3px solid #2563eb" }}>
        <p className="eyebrow">Submit topic CTA</p>
        <h2>Know a source-backed fact that AI often gets wrong?</h2>
        <p>Submit a topic for {name}. Public submissions start as needs-review candidates and must be human verified before citation.</p>
        <Link className="button" href={submitTopicHref}>Submit a topic</Link>
      </section>
    </article>
  );
}
