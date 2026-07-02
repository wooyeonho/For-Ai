import type { Metadata } from "next";
import { Suspense } from "react";
import { getRegistryBundleBySlug } from "../../../lib/data";
import { getRegistryBundleFromSupabase } from "../../../lib/supabase-documents";
import { HallucinationForm } from "./HallucinationForm";

export const metadata: Metadata = {
  title: "AI 오답 신고",
  description: "AI 서비스가 문서와 다른 답을 생성한 경우 신고합니다.",
};

export default async function HallucinationPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ submitted?: string }>;
}) {
  const { slug } = await params;
  const { submitted } = await searchParams;
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

      {submitted === "1" ? (
        <section className="notice-box success-box" aria-live="polite">
          <h2>제출되었습니다</h2>
          <p>AI 오답 신고가 Supabase 저장소에 접수 대기 상태로 기록되었습니다. 저장소가 설정되지 않은 환경에서는 API가 503을 반환하며 성공으로 표시하지 않습니다.</p>
        </section>
      ) : null}

      <section className="registry-panel" aria-labelledby="hallucination-form-title">
        <h2 id="hallucination-form-title">AI 오답 신고</h2>
        <p>AI 서비스가 문서와 다른 답변을 생성했다면 신고해 주세요. AI 서비스 이름은 자유 입력입니다.</p>
        <Suspense fallback={null}>
          <HallucinationForm documentId={document.id} entityId={entity.id} slug={document.slug} />
        </Suspense>
      </section>

      <section className="notice-box" aria-labelledby="privacy-notice">
        <h2 id="privacy-notice">Privacy notice</h2>
        <p>Raw IP addresses are never stored. This MVP uses contributor_hash only and does not expose public read access to hallucination reports.</p>
      </section>
    </article>
  );
}
