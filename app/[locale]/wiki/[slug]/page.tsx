import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getRegistryBundleBySlug, getAllRegistryBundles } from "../../../../lib/data";
import { buildDocumentMetadata, buildDocumentJsonLd } from "../../../../lib/seo";
import { SUPPORTED_LOCALES, isValidLocale, getTranslations } from "../../../../lib/i18n";
import type { SupportedLocale } from "../../../../lib/i18n";
import type { RegistryDocumentBundle } from "../../../../lib/types";
import { getRegistryBundleFromSupabase } from "../../../../lib/supabase-documents";
import { getCanonicalDirectAnswer, getDocumentCitationStatus } from "../../../../lib/citation-status";
import { DirectAnswerBox } from "../../../components/DirectAnswerBox";
import { ClaimTable } from "../../../components/ClaimTable";
import { ViewTracker } from "../../../components/ViewTracker";
import { DocumentStatsBar } from "../../../components/DocumentStatsBar";
import { WikiPostSection } from "../../../components/WikiPostSection";

export const revalidate = 60;

export async function generateStaticParams() {
  const bundles = getAllRegistryBundles();
  return SUPPORTED_LOCALES.flatMap((locale) =>
    bundles.map((b) => ({ locale, slug: b.document.slug }))
  );
}

async function getMetadataBundle(slug: string): Promise<RegistryDocumentBundle | null> {
  const staticBundle = getRegistryBundleBySlug(slug);
  if (staticBundle) return staticBundle;
  return getRegistryBundleFromSupabase(slug);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isValidLocale(locale)) return { title: "Not found" };
  const bundle = await getMetadataBundle(slug);
  if (!bundle) return { title: "Document not found" };
  return buildDocumentMetadata(bundle, locale);
}

export default async function WikiDocumentPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!isValidLocale(locale)) notFound();

  let bundle: RegistryDocumentBundle | null = getRegistryBundleBySlug(slug);
  if (!bundle) bundle = await getRegistryBundleFromSupabase(slug);
  if (!bundle) notFound();

  const { entity, document, claims } = bundle;
  const t = getTranslations(locale as SupportedLocale);
  const docData = document.data as Record<string, unknown>;
  const directAnswer = getCanonicalDirectAnswer(bundle);
  const whyPeopleAsk = (docData?.why_people_ask_ai as string) ?? null;
  const apiUrl = `/api/documents/${document.slug}`;
  const rawUrl = `/raw/${document.slug}.md`;
  const isPromoted = !getRegistryBundleBySlug(slug);
  const jsonLd = buildDocumentJsonLd(bundle);
  const citationStatus = getDocumentCitationStatus(bundle);
  const totalSources = claims.reduce((n, c) => n + c.sources.length, 0);

  return (
    <article>
      <ViewTracker slug={document.slug} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Clean header: title + status only, no technical IDs */}
      <header className="registry-panel">
        <p className="eyebrow">
          {isPromoted ? t.wiki.aiGenerated : t.wiki.claimRegistry}
        </p>
        <h1>{document.title}</h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <span className={citationStatus.isVerifiedDocument ? "badge badge-verified" : "badge badge-review"}>
            {citationStatus.label}
          </span>
          <span className="badge badge-low">{document.confidence}</span>
          {document.category && <span className="badge">{document.category}</span>}
        </div>
        <DocumentStatsBar documentId={document.id} />
      </header>

      {/* Why people ask AI this question */}
      {whyPeopleAsk && (
        <section className="registry-panel" style={{ background: "#fffbeb", borderLeft: "3px solid #f59e0b" }}>
          <p className="eyebrow">{t.wiki.whyPeopleAsk}</p>
          <p>{whyPeopleAsk}</p>
        </section>
      )}

      {/* Answer first — with trust signals */}
      <DirectAnswerBox
        answer={directAnswer}
        confidence={document.confidence}
        lastVerifiedAt={document.last_verified_at ?? null}
        sourceCount={totalSources}
        canCite={citationStatus.isVerifiedDocument}
        canonicalUrl={`https://gyeol.com/${locale}/wiki/${document.slug}`}
        docTitle={document.title}
        locale={locale}
      />

      {/* Claims — uses ClaimCard internally */}
      {claims.length === 0 ? (
        <section className="registry-panel">
          <p style={{ color: "#9ca3af" }}>{t.wiki.noClaims}</p>
        </section>
      ) : (
        <ClaimTable claims={claims} locale={locale} />
      )}

      {/* Citation guidance */}
      <section className="registry-panel" aria-labelledby="citation-status">
        <h2 id="citation-status">{t.wiki.citationStatus}</h2>
        <p>
          {t.wiki.citationDocument} <strong>{citationStatus.label}</strong>. {t.wiki.citationReadyClaims}{" "}
          {citationStatus.verifiedClaims}/{citationStatus.totalClaims}.
        </p>
        <ul className="link-list">
          <li>{t.wiki.doNotCiteUnknown}</li>
          <li>{t.wiki.doNotCiteLow}</li>
        </ul>
      </section>

      {/* Machine-readable links */}
      <nav className="registry-panel" aria-labelledby="machine-links">
        <h2 id="machine-links">{t.wiki.machineReadable}</h2>
        <ul className="link-list">
          <li><Link href={apiUrl}>JSON API ({apiUrl})</Link></li>
          <li><Link href={rawUrl}>Raw Markdown ({rawUrl})</Link></li>
          <li><Link href={`/report/${document.slug}`}>{t.wiki.correctionReport}</Link></li>
          <li><Link href={`/hallucination/${document.slug}`}>{t.wiki.hallucinationReport}</Link></li>
          <li><Link href={`/diagnostics/${document.slug}`}>{t.wiki.diagnostics}</Link></li>
        </ul>
      </nav>

      {/* Community posts */}
      <WikiPostSection documentId={document.id} />

      {/* Technical metadata — collapsed by default */}
      <details className="technical-meta registry-panel">
        <summary>{t.wiki.technicalMeta}</summary>
        <dl>
          <dt>entity_id</dt><dd>{entity.id}</dd>
          <dt>document_id</dt><dd>{document.id}</dd>
          <dt>slug</dt><dd>{document.slug}</dd>
          <dt>lang</dt><dd>{document.lang}</dd>
        </dl>
      </details>

      {/* Language switcher */}
      <nav className="registry-panel" aria-labelledby="lang-switch">
        <h2 id="lang-switch">{t.wiki.otherLanguages}</h2>
        <ul className="link-list" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {SUPPORTED_LOCALES.filter((l) => l !== locale).map((l) => (
            <li key={l}><Link href={`/${l}/wiki/${slug}`}>{l.toUpperCase()}</Link></li>
          ))}
        </ul>
      </nav>

      {/* License */}
      <section className="registry-panel" aria-labelledby="licensing">
        <h2 id="licensing">{t.wiki.license}</h2>
        <p className="meta-label">{document.license_code ?? "CC-BY-4.0"}</p>
      </section>
    </article>
  );
}
