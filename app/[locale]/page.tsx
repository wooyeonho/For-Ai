import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HomeLanding } from "../components/HomeLanding";
import { SUPPORTED_LOCALES, isValidLocale } from "../../lib/i18n";

export const revalidate = 60;

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isValidLocale(locale)) return { title: "Not found" };

  return {
    title: { absolute: "For-Ai — Global Fact Registry for AI Citation" },
    description:
      "A global claim-level fact registry where AI, search engines, and humans cite the same facts from the same verified sources. Every claim has confidence, sources, and verification status.",
    alternates: {
      languages: Object.fromEntries(SUPPORTED_LOCALES.map((l) => [l, `/${l}`])),
    },
  };
}

export default async function LocaleHomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  return <HomeLanding locale={locale} />;
}
