import { notFound } from "next/navigation";
import { getRegistryBundleBySlug } from "../../../lib/data";
import { HallucinationForm } from "./HallucinationForm";

export default async function HallucinationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const bundle = getRegistryBundleBySlug(slug);

  if (!bundle) {
    notFound();
  }

  const { entity, document } = bundle;

  return (
    <section className="registry-panel">
      <p className="eyebrow">AI 오답 신고</p>
      <h1>{document.title}</h1>

      <dl className="report-meta">
        <div className="meta-item">
          <dt className="meta-label">entity_id</dt>
          <dd>{entity.id}</dd>
        </div>
        <div className="meta-item">
          <dt className="meta-label">slug</dt>
          <dd>{document.slug}</dd>
        </div>
        <div className="meta-item">
          <dt className="meta-label">confidence</dt>
          <dd>{document.confidence}</dd>
        </div>
        <div className="meta-item">
          <dt className="meta-label">status</dt>
          <dd>{document.status}</dd>
        </div>
      </dl>

      <p className="report-description">
        AI가 이 장소에 대해 잘못된 답변을 생성한 경우 아래 양식을 작성해 주세요.
      </p>

      <HallucinationForm
        documentId={document.id}
        entityId={entity.id}
        slug={document.slug}
      />

      <p className="privacy-notice">
        개인정보 보호: raw IP 주소는 저장되지 않습니다. contributor_hash만 기록됩니다.
      </p>
    </section>
  );
}
