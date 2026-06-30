import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LOCALE_CONFIG, SUPPORTED_LOCALES, isValidLocale } from "../../../lib/i18n";
import { getTopicCategorySummaries } from "../../../lib/topic-categories";

export const revalidate = 60;

type TopicsParams = { locale: string };

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<TopicsParams>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isValidLocale(locale)) return { title: "Topics not found" };

  return {
    title: "Topics — For-Ai",
    description: "Explore all For-Ai claim-level fact registry categories with document counts, verified claims, and review queues.",
    alternates: {
      languages: Object.fromEntries(SUPPORTED_LOCALES.map((l) => [l, `/${l}/topics`])),
    },
  };
}

export default async function TopicsIndexPage({
  params,
}: {
  params: Promise<TopicsParams>;
}) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  const categories = getTopicCategorySummaries();
  const totals = categories.reduce(
    (acc, category) => ({
      documents: acc.documents + category.documentCount,
      verifiedClaims: acc.verifiedClaims + category.verifiedClaimCount,
      needsReview: acc.needsReview + category.needsReviewCount,
    }),
    { documents: 0, verifiedClaims: 0, needsReview: 0 },
  );

  return (
    <article>
      <header className="registry-panel">
        <p className="eyebrow">Explore topics</p>
        <h1>Claim-level topics index</h1>
        <p>
          Browse every For-Ai category as a static-first index. Each topic shows how many documents exist,
          how many claims are citation-ready, and how many claims still need human review.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <span className="badge">{categories.length} categories</span>
          <span className="badge">{totals.documents} documents</span>
          <span className="badge badge-verified">{totals.verifiedClaims} verified claims</span>
          <span className="badge badge-review">{totals.needsReview} needs review</span>
        </div>
      </header>

      <section className="registry-panel" aria-labelledby="topic-categories">
        <p className="eyebrow">Category coverage</p>
        <h2 id="topic-categories">All categories</h2>
        <div className="registry-index" style={{ display: "grid", gap: 12 }}>
          {categories.map((category) => (
            <section key={category.slug} className="registry-row" aria-labelledby={`topic-${category.slug}`}>
              <div className="registry-row-main">
                <h3 id={`topic-${category.slug}`} className="registry-row-title" style={{ margin: 0 }}>
                  <Link href={`/${locale}/topics/${category.slug}`}>{category.title}</Link>
                </h3>
                <p className="stat-note" style={{ margin: "6px 0 0" }}>{category.description}</p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                  <span className="badge">{category.documentCount} documents</span>
                  <span className="badge badge-verified">{category.verifiedClaimCount} verified claims</span>
                  <span className="badge badge-review">{category.needsReviewCount} needs review</span>
                </div>
              </div>
              <div className="registry-row-meta" style={{ alignItems: "flex-end" }}>
                <Link className="btn btn-primary" href={`/${locale}/topics/${category.slug}`}>
                  View documents
                </Link>
                <Link className="btn" href={`/suggest-topic?category=${encodeURIComponent(category.slug)}`}>
                  Suggest missing fact
                </Link>
              </div>
            </section>
          ))}
        </div>
      </section>

      <nav className="registry-panel" aria-labelledby="topic-index-languages">
        <h2 id="topic-index-languages">Other languages</h2>
        <ul className="link-list" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {SUPPORTED_LOCALES.filter((l) => l !== locale).map((l) => (
            <li key={l}>
              <Link href={`/${l}/topics`}>
                {LOCALE_CONFIG[l].flag} {LOCALE_CONFIG[l].nativeName}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </article>
  );
}
