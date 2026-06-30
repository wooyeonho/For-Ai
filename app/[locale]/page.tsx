import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HomePageContent, metadata as rootMetadata } from "../page";
import { isValidLocale, SUPPORTED_LOCALES } from "../../lib/i18n";
import type { SupportedLocale } from "../../lib/i18n";

interface LocaleHomePageProps {
  params: Promise<{ locale: string }>;
}

export const metadata: Metadata = rootMetadata;

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }));
}

export default async function LocaleHomePage({ params }: LocaleHomePageProps) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  return <HomePageContent locale={locale as SupportedLocale} />;
}
