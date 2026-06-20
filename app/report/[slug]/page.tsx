import { notFound } from "next/navigation";
import { getRegistryBundleBySlug } from "../../../lib/data";
import { ReportForm } from "./ReportForm";

export default async function ReportPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const bundle = getRegistryBundleBySlug(slug);

  if (!bundle) {
    notFound();
  }

  const { entity, document } = bundle;

  return (
    <section className="registry-panel">
      <p className="eyebrow">정정 신고</p>
      <h1>{document.title}</h1>
      <p className="report-description">
        이 문서의 정보가 잘못되었거나 업데이트가 필요한 경우 아래 양식을 작성해 주세요.
      </p>

      <ReportForm
        documentId={document.id}
        entityId={entity.id}
        slug={document.slug}
      />
    </section>
  );
}
