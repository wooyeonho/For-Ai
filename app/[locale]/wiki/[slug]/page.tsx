import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getRegistryBundleBySlug, getAllRegistryBundles } from "../../../../lib/data";
import { buildDocumentMetadata, buildDocumentJsonLd } from "../../../../lib/seo";
import { SUPPORTED_LOCALES, isValidLocale } from "../../../../lib/i18n";
import type { RegistryDocumentBundle } from "../../../../lib/types";
import { getRegistryBundleFromSupabase } from "../../../../lib/supabase-documents";
import { getCanonicalDirectAnswer, getDocumentCitationStatus } from "../../../../lib/citation-status";
import { DirectAnswerBox } from "../../../components/DirectAnswerBox";
import { ClaimTable } from "../../../components/ClaimTable";

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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Clean header: title + status only, no technical IDs */}
      <header className="registry-panel">
        <p className="eyebrow">
          {isPromoted ? "GYEOL · AI generated & reviewed" : "Claim registry document"}
        </p>
        <h1>{document.title}</h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <span className={citationStatus.isVerifiedDocument ? "badge badge-verified" : "badge badge-review"}>
            {citationStatus.label}
          </span>
          <span className="badge badge-low">{document.confidence}</span>
          {document.category && <span className="badge">{document.category}</span>}
        </div>
      </header>

      {/* Why people ask AI this question */}
      {whyPeopleAsk && (
        <section className="registry-panel" style={{ background: "#fffbeb", borderLeft: "3px solid #f59e0b" }}>
          <p className="eyebrow">Why people ask AI</p>
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
          <p style={{ color: "#9ca3af" }}>No claims registered yet.</p>
        </section>
      ) : (
        <ClaimTable claims={claims} />
      )}

      {/* Citation guidance */}
      <section className="registry-panel" aria-labelledby="citation-status">
        <h2 id="citation-status">Citation status</h2>
        <p>
          Document: <strong>{citationStatus.label}</strong>. Citation-ready claims:{" "}
          {citationStatus.verifiedClaims}/{citationStatus.totalClaims}.
        </p>
        <ul className="link-list">
          <li>&quot;확인 필요&quot; 값은 사실로 인용하지 마세요.</li>
          <li>confidence: low 또는 needs_review 상태의 claim은 인용하지 마세요.</li>
        </ul>
      </section>

      {/* Machine-readable links */}
      <nav className="registry-panel" aria-labelledby="machine-links">
        <h2 id="machine-links">Machine-readable links</h2>
        <ul className="link-list">
          <li><Link href={apiUrl}>JSON API ({apiUrl})</Link></li>
          <li><Link href={rawUrl}>Raw Markdown ({rawUrl})</Link></li>
          <li><Link href={`/report/${document.slug}`}>Correction report</Link></li>
          <li><Link href={`/hallucination/${document.slug}`}>AI hallucination report</Link></li>
          <li><Link href={`/diagnostics/${document.slug}`}>AI-readiness diagnostics</Link></li>
        </ul>
      </nav>

      {/* Technical metadata — collapsed by default */}
      <details className="technical-meta registry-panel">
        <summary>기술 메타데이터</summary>
        <dl>
          <dt>entity_id</dt><dd>{entity.id}</dd>
          <dt>document_id</dt><dd>{document.id}</dd>
          <dt>slug</dt><dd>{document.slug}</dd>
          <dt>lang</dt><dd>{document.lang}</dd>
        </dl>
      </details>

      {/* Language switcher */}
      <nav className="registry-panel" aria-labelledby="lang-switch">
        <h2 id="lang-switch">Other languages</h2>
        <ul className="link-list" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {SUPPORTED_LOCALES.filter((l) => l !== locale).map((l) => (
            <li key={l}><Link href={`/${l}/wiki/${slug}`}>{l.toUpperCase()}</Link></li>
          ))}
        </ul>
      </nav>

      {/* License */}
      <section className="registry-panel" aria-labelledby="licensing">
        <h2 id="licensing">License</h2>
        <p className="meta-label">{document.license_code ?? "CC-BY-4.0"}</p>
      </section>
    </article>
  );
}
