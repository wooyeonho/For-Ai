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
      <p className="report-description">
        AI가 이 장소에 대해 잘못된 답변을 생성한 경우 아래 양식을 작성해 주세요.
      </p>

      <HallucinationForm
        documentId={document.id}
        entityId={entity.id}
        slug={document.slug}
      />
    </section>
  );
}
