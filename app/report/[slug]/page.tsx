import type { Metadata } from "next";
import { getRegistryBundleBySlug } from "../../../lib/data";
import { ReportForm } from "./ReportForm";

export const metadata: Metadata = {
  title: "정정 제보",
  description: "레지스트리 문서의 claim에 대한 정정을 제보합니다.",
};

export default async function ReportPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const bundle = getRegistryBundleBySlug(slug);

  if (!bundle) {
    return (
      <section className="registry-panel">
        <p className="eyebrow">Correction report</p>
        <h1>Document not found</h1>
        <p>요청한 문서를 찾을 수 없습니다.</p>
      </section>
    );
  }

  const { entity, document, claims } = bundle;

  return (
    <article>
      <header className="registry-panel">
        <p className="eyebrow">Correction report</p>
        <h1>{document.title}</h1>
        <div className="meta-grid">
          <div><span className="meta-label">entity_id</span><br />{entity.id}</div>
          <div><span className="meta-label">slug</span><br />{document.slug}</div>
          <div><span className="meta-label">status</span><br />{document.status}</div>
          <div><span className="meta-label">confidence</span><br />{document.confidence}</div>
        </div>
      </header>

      <section className="registry-panel" aria-labelledby="report-form-title">
        <h2 id="report-form-title">정정 요청</h2>
        <p>확인이 필요한 claim에 대해 정정 요청을 남겨주세요. 로그인은 필요하지 않으며, 제출은 공개 읽기 권한이 없는 API로 처리됩니다.</p>
        <p className="meta-label">대상 claim: {claims.map((claim) => claim.field_path).join(", ") || "전체 문서"}</p>
        <ReportForm slug={document.slug} />
      </section>

      <section className="notice-box" aria-labelledby="privacy-notice">
        <h2 id="privacy-notice">Privacy notice</h2>
        <p>Raw IP addresses are never stored. This MVP uses contributor_hash only and does not expose public read access to reports.</p>
      </section>
    </article>
  );
}
