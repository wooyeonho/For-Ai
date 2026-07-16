import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SUPPORTED_LOCALES, getTranslations, isValidLocale } from "../../../lib/i18n";
import type { SupportedLocale } from "../../../lib/i18n";
import { checkAnswerPublicNavEnabled } from "../../../lib/feature-flags";
import CheckClient from "./CheckClient";

export const revalidate = 3600;

type CheckParams = { locale: string };

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<CheckParams> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isValidLocale(locale)) return { title: getTranslations("en").check.title };
  const t = getTranslations(locale as SupportedLocale);

  return {
    title: t.check.title,
    description: t.check.description,
    alternates: {
      languages: Object.fromEntries(SUPPORTED_LOCALES.map((l) => [l, `/${l}/check`])),
    },
    // The route stays reachable by direct URL regardless of the nav flag
    // (see lib/feature-flags.ts), but it shouldn't be indexed/crawled while
    // it's off — mirrors the same robots gating used by other not-yet-public
    // pages (app/admin/verification-policy, app/admin/verify-queue).
    ...(checkAnswerPublicNavEnabled() ? {} : { robots: { index: false, follow: false } }),
  };
}

// Server wrapper: validates locale and renders localized copy. All
// interaction (form state, the POST /api/check call, result rendering)
// lives in the client component below.
export default async function CheckPage({ params }: { params: Promise<CheckParams> }) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  const t = getTranslations(locale as SupportedLocale);

  return (
    <article>
      <header className="registry-panel">
        <p className="eyebrow">{t.check.title}</p>
        <h1>{t.check.title}</h1>
        <p style={{ maxWidth: 780 }}>{t.check.description}</p>
      </header>
      <CheckClient locale={locale as SupportedLocale} />
    </article>
  );
}
