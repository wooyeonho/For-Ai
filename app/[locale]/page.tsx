import type { Metadata } from "next";
import { notFound } from "next/navigation";
import HomePageContent from "../components/HomePageContent";
import { isValidLocale } from "../../lib/i18n";

export const metadata: Metadata = {
  title: { absolute: "For-Ai — Global Fact Registry for AI Citation" },
  description:
    "A global claim-level fact registry where AI, search engines, and humans cite the same facts from the same verified sources. Every claim has confidence, sources, and verification status.",
};

export const revalidate = 60;

export default async function LocaleHomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  return <HomePageContent locale={locale} />;
}
