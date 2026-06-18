import Link from "next/link";
import { notFound } from "next/navigation";
import { getRegistryBundleBySlug } from "../../../../lib/data";

function getStringDataValue(data: Record<string, unknown>, key: string, fallback: string): string {
  const value = data[key];
  return typeof value === "string" ? value : fallback;
}

function getMachineReadableUrl(data: Record<string, unknown>, key: "api_url" | "raw_markdown_url", fallback: string): string {
  const machineReadable = data.machine_readable;

  if (!machineReadable || typeof machineReadable !== "object") {
    return fallback;
  }

  const value = (machineReadable as Record<string, unknown>)[key];
  return typeof value === "string" ? value : fallback;
}

export default async function WikiDocumentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const bundle = getRegistryBundleBySlug(slug);

  if (!bundle) {
    notFound();
  }

  const { entity, document, claims } = bundle;
  const directAnswer = getStringDataValue(document.data, "direct_answer", "확인 필요");
  const licenseNotice = getStringDataValue(document.data, "license_notice", "GYEOL Data License v0.1 placeholder.");
  const apiUrl = getMachineReadableUrl(document.data, "api_url", `/api/documents/${document.slug}`);
  const rawMarkdownUrl = getMachineReadableUrl(document.data, "raw_markdown_url", `/raw/${document.slug}.md`);

  return (
    <article>
      <header className="registry-panel">
        <p className="eyebrow">Claim registry document</p>
        <h1>{document.title}</h1>
        <div className="meta-grid">
          <div><span className="meta-label">entity_id</span><br />{entity.id}</div>
          <div><span className="meta-label">document_id</span><br />{document.id}</div>
          <div><span className="meta-label">language</span><br />{document.lang}</div>
          <div><span className="meta-label">slug</span><br />{document.slug}</div>
          <div><span className="meta-label">status</span><br /><span className="badge badge-review">{document.status}</span></div>
          <div><span className="meta-label">confidence</span><br /><span className="badge badge-low">{document.confidence}</span></div>
          <div><span className="meta-label">license</span><br />{document.license_code}</div>
        </div>
      </header>

      <section className="registry-panel" aria-labelledby="direct-answer">
        <h2 id="direct-answer">직접 답변</h2>
        <p><strong>{directAnswer}</strong></p>
      </section>

      <section className="registry-panel" aria-labelledby="claims">
        <h2 id="claims">Claims</h2>
        {claims.map((claim) => (
          <div className="claim-card" key={claim.id}>
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
          <li><Link href={apiUrl}>JSON API</Link></li>
          <li><Link href={rawMarkdownUrl}>Raw Markdown</Link></li>
          <li><Link href={`/report/${document.slug}`}>Correction report</Link></li>
          <li><Link href={`/hallucination/${document.slug}`}>AI hallucination report</Link></li>
          <li><Link href={`/diagnostics/${document.slug}`}>AI-readiness diagnostics</Link></li>
        </ul>
      </nav>

      <section className="registry-panel" aria-labelledby="licensing">
        <h2 id="licensing">External data licensing placeholder</h2>
        <p>{licenseNotice}</p>
      </section>
    </article>
  );
}
