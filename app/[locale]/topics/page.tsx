import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAllRegistryBundles } from "../../../lib/data";
import { getDocumentCitationStatus } from "../../../lib/citation-status";
import { SUPPORTED_LOCALES, isValidLocale } from "../../../lib/i18n";
import type { RegistryDocumentBundle } from "../../../lib/types";

export const revalidate = 60;

type TopicsPageParams = { locale: string };

const TOPIC_ALIASES: Record<string, string[]> = {
  visa: ["visa", "immigration", "travel.visa"],
  transport: ["transport", "transit", "fare", "schedule", "metro", "rail", "bus"],
  "government-fees": ["government-fees", "government", "fee", "administration", "documents"],
  "public-services": ["public-services", "public_service", "civil", "administration"],
  "saas-pricing": ["saas-pricing", "saas", "pricing", "technology"],
  "business-hours": ["business-hours", "hours", "opening", "venue", "food", "dining"],
  refunds: ["refunds", "refund", "returns", "commerce"],
  education: ["education", "admission", "tuition", "school", "university"],
  "healthcare-operations": ["healthcare-operations", "healthcare", "hospital", "clinic", "medical"],
  "travel-rules": ["travel-rules", "travel", "customs", "transit", "baggage"],
};


type TopicSummary = {
  category: string;
  documents: number;
  verifiedClaims: number;
  needsReviewClaims: number;
  verifiedDocuments: number;
  sampleTitles: string[];
};

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<TopicsPageParams>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isValidLocale(locale)) return { title: "Topics not found" };

  return {
    title: "Topics | For-Ai",
    description:
      "Browse For-Ai claim-level registry topics with document counts, verified claim counts, and needs-review queues.",
    alternates: {
      languages: Object.fromEntries(SUPPORTED_LOCALES.map((l) => [l, `/${l}/topics`])),
    },
  };
}

export default async function TopicsIndexPage({
  params,
}: {
  params: Promise<TopicsPageParams>;
}) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  const topics = buildTopicSummaries(getAllRegistryBundles());
  const totals = topics.reduce(
    (acc, topic) => ({
      documents: acc.documents + topic.documents,
      verifiedClaims: acc.verifiedClaims + topic.verifiedClaims,
      needsReviewClaims: acc.needsReviewClaims + topic.needsReviewClaims,
    }),
    { documents: 0, verifiedClaims: 0, needsReviewClaims: 0 },
  );

  return (
    <article>
      <header className="registry-panel">
        <p className="eyebrow">Registry topics</p>
        <h1>Browse facts by topic</h1>
        <p style={{ maxWidth: 760 }}>
          Enter every major claim registry area by click. Counts are computed from claim-level registry bundles, so unknown or incomplete facts remain in the needs-review queue until source-backed human verification.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <span className="badge">{topics.length} categories</span>
          <span className="badge">{totals.documents} documents</span>
          <span className="badge badge-verified">{totals.verifiedClaims} verified claims</span>
          <span className="badge badge-review">{totals.needsReviewClaims} needs review</span>
        </div>
      </header>

      <section className="registry-panel" aria-labelledby="topic-list">
        <h2 id="topic-list">Category index</h2>
        {topics.length === 0 ? (
          <p className="stat-note">No registry categories are available yet. Missing facts should be submitted as needs-review candidates.</p>
        ) : (
          <div className="audience-grid">
            {topics.map((topic) => (
              <Link key={topic.category} href={`/${locale}/topics/${encodeURIComponent(topic.category)}`} className="audience-card">
                <p className="eyebrow">{topic.verifiedDocuments} citation-ready document(s)</p>
                <h3>{formatCategoryTitle(topic.category)}</h3>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                  <span className="badge">{topic.documents} documents</span>
                  <span className="badge badge-verified">{topic.verifiedClaims} verified claims</span>
                  <span className="badge badge-review">{topic.needsReviewClaims} needs review</span>
                </div>
                {topic.sampleTitles.length > 0 ? (
                  <p className="meta-label" style={{ marginTop: 12 }}>Examples: {topic.sampleTitles.join(" · ")}</p>
                ) : null}
              </Link>
            ))}
          </div>
        )}
      </section>
    </article>
  );
}

function buildTopicSummaries(bundles: RegistryDocumentBundle[]): TopicSummary[] {
  return Object.entries(TOPIC_ALIASES)
    .map(([category, aliases]) => {
      const categoryBundles = bundles.filter((bundle) => matchesTopic(bundle, aliases));
      const statuses = categoryBundles.map(getDocumentCitationStatus);
      const verifiedClaims = statuses.reduce((sum, status) => sum + status.verifiedClaims, 0);
      const totalClaims = statuses.reduce((sum, status) => sum + status.totalClaims, 0);
      return {
        category,
        documents: categoryBundles.length,
        verifiedClaims,
        needsReviewClaims: Math.max(0, totalClaims - verifiedClaims),
        verifiedDocuments: statuses.filter((status) => status.isVerifiedDocument).length,
        sampleTitles: categoryBundles.slice(0, 3).map((bundle) => bundle.document.title),
      };
    })
    .sort((a, b) => b.documents - a.documents || a.category.localeCompare(b.category));
}

function matchesTopic(bundle: RegistryDocumentBundle, aliases: string[]): boolean {
  const haystack = [
    bundle.document.category,
    bundle.document.template,
    bundle.entity.type,
    bundle.document.slug,
    bundle.document.title,
  ].join(" ").toLowerCase();
  return aliases.some((alias) => haystack.includes(alias.toLowerCase()));
}

function formatCategoryTitle(category: string): string {
  return category.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}
