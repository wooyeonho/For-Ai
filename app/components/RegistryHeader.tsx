import type { Entity, Document } from "../../lib/types";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { DocumentStatusBadge } from "./StatusBadge";

export function RegistryHeader({
  entity,
  document,
}: {
  entity: Entity;
  document: Document;
}) {
  return (
    <header className="registry-panel registry-header">
      <p className="eyebrow">GYEOL Claim Registry</p>
      <h1>{document.title}</h1>

      <div className="header-badges">
        <DocumentStatusBadge status={document.status} />
        <ConfidenceBadge level={document.confidence} />
      </div>

      <dl className="meta-grid">
        <div className="meta-item">
          <dt className="meta-label">entity_id</dt>
          <dd>{entity.id}</dd>
        </div>
        <div className="meta-item">
          <dt className="meta-label">document_id</dt>
          <dd>{document.id}</dd>
        </div>
        <div className="meta-item">
          <dt className="meta-label">언어</dt>
          <dd>{document.lang}</dd>
        </div>
        <div className="meta-item">
          <dt className="meta-label">slug</dt>
          <dd>{document.slug}</dd>
        </div>
        <div className="meta-item">
          <dt className="meta-label">분류</dt>
          <dd>{document.category}</dd>
        </div>
        <div className="meta-item">
          <dt className="meta-label">라이선스</dt>
          <dd>{document.license_code}</dd>
        </div>
      </dl>
    </header>
  );
}
