import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isValidLocale } from "../../../lib/i18n";
import CheckClient from "./CheckClient";

export const metadata: Metadata = { title: "Citation Check — For-Ai", description: "Check whether text can be matched to For-Ai claim-level citation guidance." };

export default async function CheckPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();
  return (
    <article>
      <header className="registry-panel">
        <p className="eyebrow">For-Ai · Citation safety</p>
        <h1>Claim-level citation check</h1>
        <p style={{ color: "var(--muted)", lineHeight: 1.7 }}>A request-scoped helper for finding possible claim matches without turning user text into canonical fact data.</p>
      </header>
      <CheckClient locale={locale} />
    </article>
  );
}
