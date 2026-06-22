import Link from "next/link";
import { seedRegistryBundle } from "../../../lib/seed-data";

export default function AdminReviewPage() {
  const { entity, document, claims } = seedRegistryBundle;

  return (
    <article>
      <header className="registry-panel">
        <p className="eyebrow">Goal 6 · Minimal admin review</p>
        <h1>Admin review queue</h1>
        <p>Seed registry review surface only. No login system, database writes, or public submission reads are implemented in the MVP.</p>
        <div className="meta-grid">
          <div><span className="meta-label">entity_id</span><br />{entity.id}</div>
          <div><span className="meta-label">document</span><br />{document.id}</div>
          <div><span className="meta-label">status</span><br />{document.status}</div>
          <div><span className="meta-label">confidence</span><br />{document.confidence}</div>
        </div>
      </header>

      <section className="registry-panel" aria-labelledby="review-claims">
        <h2 id="review-claims">Claims needing review</h2>
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
          </div>
        ))}
      </section>

      <nav className="registry-panel" aria-labelledby="admin-tools">
        <h2 id="admin-tools">Admin content tools</h2>
        <ul className="link-list">
          <li><Link href="/admin/new-entity">Create new entity draft</Link></li>
          <li><Link href="/admin/new-document">Create new document draft</Link></li>
          <li><Link href="/admin/import">Bulk import stub</Link></li>
        </ul>
      </nav>
    </article>
  );
}
