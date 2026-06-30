import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getRegistryIndex } from "../../../lib/registry-index";
import { LOCALE_CONFIG, SUPPORTED_LOCALES, isValidLocale } from "../../../lib/i18n";

export const revalidate = 60;

const TOPIC_ORDER = [
  "visa",
  "transport",
  "government-fees",
  "public-services",
  "saas-pricing",
  "business-hours",
  "refunds",
  "education",
  "healthcare-operations",
  "travel-rules",
];

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

type TopicsPageParams = { locale: string };
type TopicSummary = { category: string; documentCount: number; verifiedCount: number; staleCount: number };

export const metadata: Metadata = {
  title: "Topics — For-Ai",
  description: "Browse the For-Ai claim-level registry by topic category, document count, verified coverage, and stale facts.",
};

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }));
}

export default async function TopicsPage({ params }: { params: Promise<TopicsPageParams> }) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  const items = await getRegistryIndex();
  const topics = summarizeTopics(items.map((item) => ({
    haystack: `${item.type} ${item.title} ${item.entity_name} ${item.slug}`,
    canCite: item.can_cite,
    freshness: item.freshness,
  })));

  return (
    <article>
      <header className="registry-panel">
        <p className="eyebrow">Registry navigation</p>
        <h1>Browse topics</h1>
        <p style={{ maxWidth: 760 }}>
          Enter the claim-level registry by category. Counts come from the normalized registry index, so static-first pages remain discoverable even when optional database indexing is unavailable.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <span className="badge">{topics.length} categories</span>
          <span className="badge">{items.length} documents</span>
        </div>
      </header>

      <section className="registry-panel" aria-labelledby="topic-list">
        <h2 id="topic-list">Category index</h2>
        {topics.length === 0 ? (
          <p className="stat-note">Needs verification: no registry topics are available yet.</p>
        ) : (
          <ul className="registry-index">
            {topics.map((topic) => (
              <li key={topic.category} className="registry-row">
                <div className="registry-row-main">
                  <Link href={`/${locale}/topics/${topic.category}`} className="registry-row-title">
                    {formatTopic(topic.category)}
                  </Link>
                  <span className="registry-row-entity">{topic.documentCount} document(s)</span>
                </div>
                <div className="registry-row-meta">
                  <span className="badge badge-verified">{topic.verifiedCount} verified</span>
                  <span className="badge badge-warning">{topic.staleCount} stale</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <nav className="registry-panel" aria-labelledby="topic-language-list">
        <h2 id="topic-language-list">Other languages</h2>
        <ul className="link-list" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {SUPPORTED_LOCALES.filter((l) => l !== locale).map((l) => (
            <li key={l}>
              <Link href={`/${l}/topics`}>{LOCALE_CONFIG[l].flag} {LOCALE_CONFIG[l].nativeName}</Link>
            </li>
          ))}
        </ul>
      </nav>
    </article>
  );
}

function summarizeTopics(items: { haystack: string; canCite: boolean; freshness: string }[]): TopicSummary[] {
  const summaries = new Map(TOPIC_ORDER.map((category) => [category, { category, documentCount: 0, verifiedCount: 0, staleCount: 0 }]));
  for (const item of items) {
    const haystack = item.haystack.toLowerCase();
    const matchedTopics = TOPIC_ORDER.filter((topic) => TOPIC_ALIASES[topic].some((alias) => haystack.includes(alias.toLowerCase())));
    for (const category of matchedTopics) {
      const current = summaries.get(category);
      if (!current) continue;
      current.documentCount += 1;
      if (item.canCite) current.verifiedCount += 1;
      if (item.freshness === "stale") current.staleCount += 1;
    }
  }
  return [...summaries.values()].sort((a, b) => topicRank(a.category) - topicRank(b.category));
}

function formatTopic(category: string): string {
  return category.replace(/[-_]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function topicRank(category: string): number {
  const index = TOPIC_ORDER.indexOf(category);
  return index === -1 ? TOPIC_ORDER.length : index;
}
