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
  if (!isValidLocale(locale)) return { title: "Topics not found" };
  return {
    title: "Topics — For-Ai",
    description: "Browse For-Ai claim-level documents by public topic and verification domain.",
    alternates: { languages: Object.fromEntries(SUPPORTED_LOCALES.map((l) => [l, `/${l}/topics`])) },
  };
}

export default async function TopicsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  const topics = Array.from(
    getAllRegistryBundles().reduce((map, bundle) => {
      const key = bundle.document.category || bundle.entity.type || "general";
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
        <h1>Topics</h1>
        <p>Browse the public fact registry by domain. Each entry leads to claim-level documents with confidence, source, and verification status.</p>
      </header>
      <section className="registry-panel" aria-labelledby="topic-index">
        <h2 id="topic-index">Topic index</h2>
        <ul className="registry-index">
          {topics.map((topic) => (
            <li key={topic.key} className="registry-row">
              <div className="registry-row-main">
                <Link className="registry-row-title" href={`/${locale}/topics/${encodeURIComponent(topic.key)}`}>{topic.key}</Link>
                <span className="registry-row-entity">{topic.examples.join(" · ")}</span>
              </div>
              <div className="registry-row-meta"><span className="badge">{topic.count} docs</span></div>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
