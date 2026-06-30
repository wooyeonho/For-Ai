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
  if (!isValidLocale(locale)) return { title: "Topics not found" };
  return {
    title: "Topics — For-Ai",
    description: "Browse For-Ai fact-registry categories by document count and find missing facts that need sources.",
    alternates: { languages: Object.fromEntries(SUPPORTED_LOCALES.map((l) => [l, `/${l}/topics`])) },
  };
}

type CategorySummary = {
  category: string;
  documents: number;
  verified: number;
  needsReview: number;
  stale: number;
  examples: RegistryIndexItem[];
};

function summarizeCategories(items: RegistryIndexItem[]): CategorySummary[] {
  const groups = new Map<string, CategorySummary>();
  for (const item of items) {
    const category = item.category || item.type || "uncategorized";
    const summary = groups.get(category) ?? { category, documents: 0, verified: 0, needsReview: 0, stale: 0, examples: [] };
    summary.documents += 1;
    if (item.can_cite) summary.verified += 1;
    else summary.needsReview += 1;
    if (item.freshness === "stale") summary.stale += 1;
    if (summary.examples.length < 3) summary.examples.push(item);
    groups.set(category, summary);
  }
  return [...groups.values()].sort((a, b) => b.documents - a.documents || a.category.localeCompare(b.category));
}

export default async function TopicsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  const items = await getRegistryIndex({ verification: "all" });
  const categories = summarizeCategories(items);
  const missingFactsCount = categories.reduce((sum, category) => sum + category.needsReview + category.stale, 0);

  return (
    <article>
      <header className="registry-panel">
        <p className="eyebrow">Registry exploration</p>
        <h1>Browse fact-registry topics</h1>
        <p>
          Explore categories by document count. Verified facts are citable only when source-backed; missing or stale facts remain marked as needs review.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <span className="badge">{categories.length} categories</span>
          <span className="badge badge-verified">{items.filter((item) => item.can_cite).length} citable documents</span>
          <span className="badge badge-review">{missingFactsCount} missing or stale fact opportunities</span>
        </div>
      </header>

      <section className="registry-panel" aria-labelledby="missing-facts-cta">
        <p className="eyebrow">Missing facts CTA</p>
        <h2 id="missing-facts-cta">Know a fact AI gets wrong?</h2>
        <p>
          Submit the topic as a source-finding candidate. Unknowns stay as <strong>Needs verification</strong> until a human reviewer verifies source-backed claims.
        </p>
        <Link className="cta-link" href="/suggest-topic">Suggest a missing fact</Link>
      </section>

      <section className="registry-panel" aria-labelledby="category-list">
        <h2 id="category-list">Categories</h2>
        <ul className="registry-index">
          {categories.map((category) => (
            <li key={category.category} className="registry-row">
              <div className="registry-row-main">
                <strong className="registry-row-title">{category.category}</strong>
                <span className="registry-row-entity">
                  {category.examples.map((item) => item.title).join(" · ") || "No example documents yet"}
                </span>
              </div>
              <div className="registry-row-meta">
                <span className="badge">{category.documents} documents</span>
                <span className="badge badge-verified">{category.verified} verified</span>
                <span className="badge badge-review">{category.needsReview} needs review</span>
                {category.stale > 0 ? <span className="badge badge-warning">{category.stale} stale</span> : null}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
