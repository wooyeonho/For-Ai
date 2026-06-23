import Link from "next/link";
import { notFound } from "next/navigation";
import { getRegistryBundleBySlug, getAllRegistryBundles } from "../../../../lib/data";
import { buildDocumentJsonLd, buildDocumentMetadata } from "../../../../lib/seo";

export async function generateStaticParams() {
  return getAllRegistryBundles().map((b) => ({ slug: b.document.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const bundle = getRegistryBundleBySlug(slug);

  if (!bundle) {
    return {};
  }

  return buildDocumentMetadata(bundle);
}

export default async function WikiDocumentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const bundle = getRegistryBundleBySlug(slug);
  if (!bundle) notFound();

  const { entity, document, claims } = bundle;
  const docData = document.data as Record<string, unknown>;
  const directAnswer = (docData?.direct_answer as string) ?? null;
  const apiUrl = `/api/documents/${document.slug}`;
  const rawUrl = `/raw/${document.slug}.md`;
  const jsonLd = buildDocumentJsonLd(bundle);
  const lastVerifiedAt = document.last_verified_at ?? "확인 필요";
  const lastUpdatedAt = document.updated_at ?? "확인 필요";

  return (
    <article>
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <header className="registry-panel">
        <p className="eyebrow">Claim registry document</p>
        <h1>{document.title}</h1>
        <div className="meta-grid">
          <div><span className="meta-label">entity_id</span><br />{entity.id}</div>
          <div><span className="meta-label">slug</span><br />{document.slug}</div>
          <div><span className="meta-label">status</span><br /><span className="badge badge-review">{document.status}</span></div>
          <div><span className="meta-label">confidence</span><br /><span className="badge badge-low">{document.confidence}</span></div>
        </div>
      </header>

      <section className="registry-panel" aria-labelledby="update-status">
        <h2 id="update-status">업데이트 상태</h2>
        <div className="meta-grid">
          <div><span className="meta-label">last_verified_at</span><br />{lastVerifiedAt}</div>
          <div><span className="meta-label">updated_at</span><br />{lastUpdatedAt}</div>
          <div><span className="meta-label">source policy</span><br />출처가 없으면 확인 필요 / low confidence 유지</div>
          <div><span className="meta-label">update request</span><br /><Link href={`/report/${document.slug}`}>정정 요청</Link></div>
        </div>
        <p className="meta-label">정보가 바뀌었거나 AI가 다르게 답했다면 정정 요청 또는 AI 오답 신고로 업데이트를 요청할 수 있습니다.</p>
      </section>

      {directAnswer && (
        <section className="registry-panel" aria-labelledby="direct-answer">
          <h2 id="direct-answer">직접 답변</h2>
          <p><strong>{directAnswer}</strong></p>
        </section>
      )}

      <section className="registry-panel" aria-labelledby="claims">
        <h2 id="claims">Claims</h2>
        {claims.map((claim) => (
          <div className="claim-card" key={claim.field_path}>
            <p className="eyebrow">{claim.field_path}</p>
            <p><strong>{claim.claim_value}</strong></p>
            <p>{claim.claim_text}</p>
            <p>
              <span className="badge badge-low">confidence: {claim.confidence}</span>{" "}
              <span className="badge badge-review">state: {claim.status}</span>{" "}
              <span className="badge">sources: {claim.sources.length}</span>
            </p>
            {claim.last_verified_at && (
              <p className="meta-label">last_verified_at: {claim.last_verified_at}</p>
            )}
          </div>
        ))}
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
