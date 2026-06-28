import type { Metadata } from "next";
import { getRegistryBundleBySlug } from "../../../lib/data";
import { getRegistryBundleFromSupabase } from "../../../lib/supabase-documents";
import { HallucinationForm } from "./HallucinationForm";

export const metadata: Metadata = {
  title: "AI 오답 신고",
  description: "AI 서비스가 문서와 다른 답을 생성한 경우 신고합니다.",
};

export default async function HallucinationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const bundle = getRegistryBundleBySlug(slug) ?? await getRegistryBundleFromSupabase(slug);

  if (!bundle) {
    return (
      <section className="registry-panel">
        <p className="eyebrow">AI hallucination report</p>
        <h1>Document not found</h1>
        <p>요청한 문서를 찾을 수 없습니다.</p>
      </section>
    );
  }

  const { entity, document } = bundle;

  return (
    <article>
      <header className="registry-panel">
        <p className="eyebrow">AI hallucination report</p>
        <h1>{document.title}</h1>
        <div className="meta-grid">
          <div><span className="meta-label">entity_id</span><br />{entity.id}</div>
          <div><span className="meta-label">slug</span><br />{document.slug}</div>
          <div><span className="meta-label">status</span><br />{document.status}</div>
          <div><span className="meta-label">confidence</span><br />{document.confidence}</div>
        </div>
      </header>

      <section className="registry-panel" aria-labelledby="hallucination-form-title">
        <h2 id="hallucination-form-title">AI 오답 신고</h2>
        <p>AI 서비스가 문서와 다른 답변을 생성했다면 신고해 주세요. 신고 내용은 Supabase에 저장되어 관리자가 검토합니다.</p>
        <HallucinationForm documentId={document.id} entityId={entity.id} slug={document.slug} />
      </section>

      <section className="notice-box" aria-labelledby="privacy-notice">
        <h2 id="privacy-notice">Privacy notice</h2>
        <p>Raw IP addresses are never stored. Contributor hash only. Reports are reviewed before any action is taken.</p>
      </section>
    </article>
  );
}
