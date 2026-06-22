import Link from "next/link";
import { notFound } from "next/navigation";
import { getSeedDocumentBySlug, getAllSeedDocuments } from "../../../../lib/seed-data";

/** Pre-render all known slugs at build time → static HTML, no server rendering */
export async function generateStaticParams() {
  const docs = getAllSeedDocuments();
  return docs.map((doc) => ({ slug: doc.slug }));
}

export default async function WikiDocumentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const document = getSeedDocumentBySlug(slug);

  if (!document) {
    notFound();
  }

  return (
    <article>
      <header className="registry-panel">
        <p className="eyebrow">Claim registry document</p>
        <h1>{document.title}</h1>
        <div className="meta-grid">
          <div><span className="meta-label">entity_id</span><br />{document.entity_id}</div>
          <div><span className="meta-label">document_id</span><br />{document.document_id}</div>
          <div><span className="meta-label">language</span><br />{document.lang}</div>
          <div><span className="meta-label">slug</span><br />{document.slug}</div>
          <div><span className="meta-label">canonical path</span><br />{document.canonical_path}</div>
          <div><span className="meta-label">status</span><br /><span className="badge badge-review">{document.status}</span></div>
          <div><span className="meta-label">confidence</span><br /><span className="badge badge-low">{document.confidence}</span></div>
        </div>
      </header>

      <section className="registry-panel" aria-labelledby="direct-answer">
        <h2 id="direct-answer">직접 답변</h2>
        <p><strong>{document.direct_answer}</strong></p>
      </section>

      <section className="registry-panel" aria-labelledby="claims">
        <h2 id="claims">Claims</h2>
        {document.claims.map((claim) => (
          <div className="claim-card" key={claim.field_path}>
            <p className="eyebrow">{claim.field_path}</p>
            <p><strong>{claim.claim_value}</strong></p>
            <p>{claim.claim_text}</p>
            <p>
              <span className="badge badge-low">confidence: {claim.confidence}</span>{" "}
              <span className="badge badge-review">state: {claim.status}</span>{" "}
              <span className="badge">sources: {claim.sources.length}</span>
            </p>
            <p className="meta-label">last_verified_at: {claim.last_verified_at ?? "확인 필요"}</p>
          </div>
        ))}
      </section>

      <nav className="registry-panel" aria-labelledby="machine-links">
        <h2 id="machine-links">Machine-readable and submission links</h2>
        <ul className="link-list">
          <li><Link href={document.machine_readable.api_url}>JSON API</Link></li>
          <li><Link href={document.machine_readable.raw_markdown_url}>Raw Markdown</Link></li>
          <li><Link href={`/report/${document.slug}`}>Correction report</Link></li>
          <li><Link href={`/hallucination/${document.slug}`}>AI hallucination report</Link></li>
          <li><Link href={`/diagnostics/${document.slug}`}>AI-readiness diagnostics</Link></li>
        </ul>
      </nav>

      <section className="registry-panel" aria-labelledby="licensing">
        <h2 id="licensing">External data licensing placeholder</h2>
        <p>{document.license_notice}</p>
        <p className="meta-label">license label: {document.data_license.label}</p>
      </section>
    </article>
  );
}
