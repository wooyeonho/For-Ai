import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getRegistryBundleBySlug, getAllRegistryBundles } from "../../../../lib/data";
import { buildDocumentMetadata, buildDocumentJsonLd } from "../../../../lib/seo";
import { getCitationStatus } from "../../../../lib/citation-status";
import { SUPPORTED_LOCALES, isValidLocale, getTranslations } from "../../../../lib/i18n";
import type { RegistryDocumentBundle } from "../../../../lib/types";
import { getRegistryBundleFromSupabase } from "../../../../lib/supabase-documents";

export const revalidate = 60;

export async function generateStaticParams() {
  const bundles = getAllRegistryBundles();
  return SUPPORTED_LOCALES.flatMap((locale) =>
    bundles.map((b) => ({ locale, slug: b.document.slug }))
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isValidLocale(locale)) return { title: "Not found" };
  const bundle = getRegistryBundleBySlug(slug);
  if (!bundle) return { title: "Document not found" };
  return buildDocumentMetadata(bundle);
}

export default async function WikiDocumentPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!isValidLocale(locale)) notFound();

  const t = getTranslations(locale);
  let bundle: RegistryDocumentBundle | null = getRegistryBundleBySlug(slug);
  if (!bundle) bundle = await getRegistryBundleFromSupabase(slug);
  if (!bundle) notFound();

  const { entity, document, claims } = bundle;
  const docData = document.data as Record<string, unknown>;
  const directAnswer = (docData?.direct_answer as string) ?? null;
  const whyPeopleAsk = (docData?.why_people_ask_ai as string) ?? null;
  const apiUrl = `/api/documents/${document.slug}`;
  const rawUrl = `/raw/${document.slug}.md`;
  const isPromoted = !getRegistryBundleBySlug(slug);
  const jsonLd = buildDocumentJsonLd(bundle);
  const citationStatus = getCitationStatus(bundle);

  return (
    <article>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <header className={`registry-panel citation-hero citation-hero-${citationStatus.tone}`}>
        <p className="eyebrow">
          {isPromoted ? "GYEOL · AI generated & reviewed" : "Claim registry document"}
        </p>
        <h1>{document.title}</h1>
        <div className="citation-status-banner" aria-live="polite">
          <span className={`citation-status-badge citation-status-badge-${citationStatus.tone}`}>{citationStatus.label}</span>
          <span className="citation-status-summary">
            {citationStatus.citable
              ? "문서와 모든 claim이 verified이며 source가 연결되어 있습니다."
              : `문서 또는 claim 확인이 필요합니다. needs_review ${citationStatus.needsReviewCount}개 · source 없음 ${citationStatus.missingSourceCount}개`}
          </span>
        </div>
        <div className="meta-grid">
          <div><span className="meta-label">entity_id</span><br />{entity.id}</div>
          <div><span className="meta-label">slug</span><br />{document.slug}</div>
          <div><span className="meta-label">status</span><br /><span className="badge badge-review">{document.status}</span></div>
          <div><span className="meta-label">{t.claims.confidence}</span><br /><span className="badge badge-low">{document.confidence}</span></div>
        </div>
        {document.category && (
          <p style={{ marginTop: 8, fontSize: 13, color: "#6b7280" }}>category: {document.category}</p>
        )}
      </header>

      {whyPeopleAsk && (
        <section className="registry-panel" style={{ background: "#fffbeb", borderLeft: "3px solid #f59e0b" }}>
          <p className="eyebrow">Why people ask AI</p>
          <p>{whyPeopleAsk}</p>
        </section>
      )}

      {directAnswer && citationStatus.citable && (
        <section className="registry-panel direct-answer-box" aria-labelledby="direct-answer">
          <h2 id="direct-answer">Direct Answer</h2>
          <p><strong>{directAnswer}</strong></p>
        </section>
      )}

      {directAnswer && !citationStatus.citable && (
        <section className="registry-panel citation-warning-panel" aria-labelledby="direct-answer-review">
          <h2 id="direct-answer-review">확인 필요</h2>
          <p>이 문서는 아직 인용 가능한 상태가 아닙니다. 직접 답변보다 claim별 검증 상태와 source 유무를 먼저 확인하세요.</p>
          <p className="muted-text">검토 전 답변: {directAnswer}</p>
        </section>
      )}

      <section className="registry-panel" aria-labelledby="claims">
        <h2 id="claims">{t.claims.needsReview} ({claims.length})</h2>
        {claims.length === 0 ? (
          <p style={{ color: "#9ca3af" }}>No claims registered.</p>
        ) : (
          claims.map((claim) => (
            <div className="claim-card" key={claim.field_path}>
              <p className="eyebrow">{claim.field_path}</p>
              <p><strong>{claim.claim_value}</strong></p>
              {claim.claim_text && <p>{claim.claim_text}</p>}
              <p>
                <span className="badge badge-low">{t.claims.confidence}: {claim.confidence}</span>{" "}
                <span className="badge badge-review">state: {claim.status}</span>{" "}
                <span className={claim.sources.length === 0 ? "badge badge-disputed" : "badge"}>{t.claims.sources}: {claim.sources.length}</span>
              </p>
              {claim.last_verified_at && (
                <p className="meta-label">{t.claims.lastVerified}: {claim.last_verified_at}</p>
              )}
            </div>
          ))
        )}
      </section>

      <section className="registry-panel" aria-labelledby="citation-status">
        <h2 id="citation-status">Citation status</h2>
        <p>
          <strong>{citationStatus.label}</strong> — document.status가 verified이고 모든 claim이 verified/source 있음인 경우에만 사실값을 인용할 수 있습니다.
        </p>
        <ul className="link-list">
          <li>Do not cite values marked “확인 필요” as factual answers.</li>
          <li>Do not cite low-confidence or needs_review claims as factual answers.</li>
          <li>Current claim source counts are shown on each claim card above.</li>
        </ul>
      </section>

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

      <section className="registry-panel" aria-labelledby="licensing">
        <h2 id="licensing">License</h2>
        <p className="meta-label">{document.license_code ?? "CC-BY-4.0"}</p>
      </section>

      <nav className="registry-panel" aria-labelledby="lang-switch">
        <h2 id="lang-switch">Other languages</h2>
        <ul className="link-list" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {SUPPORTED_LOCALES.filter((l) => l !== locale).map((l) => (
            <li key={l}><Link href={`/${l}/wiki/${slug}`}>{l.toUpperCase()}</Link></li>
          ))}
        </ul>
      </nav>
    </article>
  );
}
