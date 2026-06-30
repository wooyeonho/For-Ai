import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getHtmlLang, getLocaleAlternates, getLocaleDir, getOgLocale, isValidLocale } from "../../lib/i18n";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isValidLocale(locale)) return {};

  return {
    alternates: {
      canonical: `/${locale}`,
      languages: getLocaleAlternates((alternateLocale) => `/${alternateLocale}`),
    },
    openGraph: {
      locale: getOgLocale(locale),
    },
    other: {
      "content-language": getHtmlLang(locale),
      "for-ai-locale-scope": locale,
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  const htmlLang = getHtmlLang(locale);
  const dir = getLocaleDir(locale);

  return (
    <div lang={htmlLang} dir={dir} data-locale={locale}>
      {children}
    </div>
  );
}
