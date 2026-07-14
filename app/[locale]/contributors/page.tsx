import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SUPPORTED_LOCALES, getTranslations, isValidLocale } from "../../../lib/i18n";
import type { SupportedLocale } from "../../../lib/i18n";

export const revalidate = 3600;

type ContributorsParams = { locale: string };

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<ContributorsParams> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isValidLocale(locale)) return { title: getTranslations("en").contributors.notFound };
  const t = getTranslations(locale as SupportedLocale);

  return {
    title: t.contributors.metadataTitle,
    description: t.contributors.metadataDescription,
    alternates: {
      languages: Object.fromEntries(SUPPORTED_LOCALES.map((l) => [l, `/${l}/contributors`])),
    },
  };
}

export default async function ContributorsPage({ params }: { params: Promise<ContributorsParams> }) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  const t = getTranslations(locale as SupportedLocale);

  return (
    <article>
      <header className="registry-panel">
        <p className="eyebrow">{t.contributors.eyebrow}</p>
        <h1>{t.contributors.title}</h1>
        <p style={{ maxWidth: 780 }}>{t.contributors.description}</p>
      </header>

      <nav className="registry-panel" aria-labelledby="contributors-actions">
        <h2 id="contributors-actions">{t.contributors.title}</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <Link className="button button-secondary" href={`/${locale}/leaderboard`}>
            {t.contributors.viewLeaderboard}
          </Link>
          <Link className="btn btn-primary" href={`/suggest-topic?lang=${encodeURIComponent(locale)}`}>
            {t.contributors.submitMissingFact}
          </Link>
        </div>
      </nav>
    </article>
  );
}
