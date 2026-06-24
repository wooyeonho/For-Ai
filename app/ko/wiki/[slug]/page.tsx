import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getRegistryBundleBySlug, getAllRegistryBundles } from "../../../../lib/data";
import { buildDocumentMetadata, buildDocumentJsonLd } from "../../../../lib/seo";
import type { RegistryDocumentBundle } from "../../../../lib/types";
import { getRegistryBundleFromSupabase } from "../../../../lib/supabase-documents";
import { getCanonicalDirectAnswer, getClaimCitationStatus, getDocumentCitationStatus, UNKNOWN_FACT_TEXT } from "../../../../lib/citation-status";

export const revalidate = 60;

export async function generateStaticParams() {
  return getAllRegistryBundles().map((b) => ({ slug: b.document.slug }));
}

async function getMetadataBundle(slug: string): Promise<RegistryDocumentBundle | null> {
  const staticBundle = getRegistryBundleBySlug(slug);
  if (staticBundle) return staticBundle;

  return getRegistryBundleFromSupabase(slug);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const bundle = await getMetadataBundle(slug);
  if (!bundle) return { title: "Document not found" };
  return buildDocumentMetadata(bundle);
}

export default async function WikiDocumentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
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

  return (
    <article>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <header className="registry-panel">
        <p className="eyebrow">
          {isPromoted ? "GYEOL · AI 생성 후 검토됨" : "Claim registry document"}
        </p>
        <h1>{document.title}</h1>
        <div className="meta-grid">
          <div><span className="meta-label">entity_id</span><br />{entity.id}</div>
          <div><span className="meta-label">slug</span><br />{document.slug}</div>
          <div><span className="meta-label">citation status</span><br /><span className={citationStatus.isVerifiedDocument ? "badge badge-verified" : "badge badge-review"}>{citationStatus.label}</span></div>
          <div><span className="meta-label">confidence</span><br /><span className="badge badge-low">{document.confidence}</span></div>
        </div>
        {document.category && (
          <p style={{ marginTop: 8, fontSize: 13, color: "#6b7280" }}>카테고리: {document.category}</p>
        )}
      </header>

      {whyPeopleAsk && (
        <section className="registry-panel" style={{ background: "#fffbeb", borderLeft: "3px solid #f59e0b" }}>
          <p className="eyebrow">왜 사람들이 AI에게 묻나요?</p>
          <p>{whyPeopleAsk}</p>
        </section>
      )}

      {directAnswer && (
        <section className="registry-panel" aria-labelledby="direct-answer">
          <h2 id="direct-answer">직접 답변</h2>
          <p><strong>{directAnswer}</strong></p>
        </section>
      )}

      <section className="registry-panel" aria-labelledby="claims">
        <h2 id="claims">확인 필요 항목 ({claims.length}개)</h2>
        {claims.length === 0 ? (
          <p style={{ color: "#9ca3af" }}>등록된 claim이 없습니다.</p>
        ) : (
          claims.map((claim) => {
            const claimCitationStatus = getClaimCitationStatus(claim);
            const displayValue = claim.claim_value || UNKNOWN_FACT_TEXT;
            const displayConfidence = displayValue === UNKNOWN_FACT_TEXT ? "low" : claim.confidence;
            return (
              <div className="claim-card" key={claim.field_path}>
                <p className="eyebrow">{claim.field_path}</p>
                <p><strong>{displayValue}</strong></p>
                {claim.claim_text && <p>{claim.claim_text}</p>}
                <p>
                  <span className={claimCitationStatus.isCitationReady ? "badge badge-verified" : "badge badge-review"}>citation: {claimCitationStatus.label}</span>{" "}
                  <span className="badge badge-low">confidence: {displayConfidence}</span>{" "}
                  <span className="badge badge-review">state: {claim.status}</span>{" "}
                  <span className="badge">sources: {claim.sources.length}</span>{" "}
                  <span className="badge">verification_events: {claim.verification_events.length}</span>
                </p>
                <p className="meta-label">{claimCitationStatus.reason}</p>
                {claim.last_verified_at && (
                  <p className="meta-label">last_verified_at: {claim.last_verified_at}</p>
                )}
              </div>
            );
          })
        )}
      </section>

      <section className="registry-panel" aria-labelledby="citation-status">
        <h2 id="citation-status">Citation status</h2>
        <p>
          Document citation status: {citationStatus.label}. Citation-ready claims: {citationStatus.verifiedClaims}/{citationStatus.totalClaims}.
          Individual claim values may be cited only when claims are verified, source-backed, and have verification events.
        </p>
        <ul className="link-list">
          <li>Do not cite values marked “확인 필요” as factual answers.</li>
          <li>Do not cite low-confidence or needs_review claims as factual answers.</li>
          <li>Current claim source counts and verification event counts are shown on each claim card above.</li>
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
    </article>
  );
}
