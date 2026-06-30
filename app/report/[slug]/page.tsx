import type { Metadata } from "next";
import { getRegistryBundleBySlug } from "../../../lib/data";
import { getRegistryBundleFromSupabase } from "../../../lib/supabase-documents";
import { ReportForm } from "./ReportForm";

export const metadata: Metadata = {
  title: "정정 제보",
  description: "레지스트리 문서의 claim에 대한 정정을 제보합니다.",
};

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ intent?: string; submitted?: string }>;
}) {
  const { slug } = await params;
  const { intent, submitted } = await searchParams;
  const bundle = getRegistryBundleBySlug(slug) ?? await getRegistryBundleFromSupabase(slug);

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
  const isSourceIntent = intent === "source";
  const isNotifyIntent = intent === "notify";
  const formTitle = isSourceIntent
    ? "Submit an official source."
    : isNotifyIntent
      ? "Get notified when verified."
      : "정정 요청";
  const formDescription = isSourceIntent
    ? "Submit an official source URL or citation for human review. This public correction flow does not immediately verify the claim."
    : isNotifyIntent
      ? "Leave a note that you want updates for this claim. The current MVP stores this as a queued correction request, not as a verified fact."
      : "확인이 필요한 claim에 대해 정정 요청을 남겨주세요. 로그인은 필요하지 않습니다.";


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

      {submitted === "1" ? (
        <section className="notice-box success-box" aria-live="polite">
          <h2>제출되었습니다</h2>
          <p>정정 요청이 접수 대기 상태로 처리되었습니다. 현재 MVP에서는 저장소에 기록하지 않는 안전한 stub 응답입니다.</p>
        </section>
      ) : null}

      <section className="registry-panel" aria-labelledby="report-form-title">
        <h2 id="report-form-title">{formTitle}</h2>
        <p>{formDescription}</p>
        {isSourceIntent ? (
          <p className="meta-label">Official sources are reviewed by humans before any claim status changes to verified.</p>
        ) : null}
        <ReportForm
          documentId={document.id}
          entityId={entity.id}
          slug={document.slug}
          intent={isSourceIntent ? "source" : isNotifyIntent ? "notify" : "correction"}
          claims={claims.map((claim) => ({ id: claim.id, field_path: claim.field_path, claim_text: claim.claim_text }))}
        />
      </section>

      <section className="notice-box" aria-labelledby="privacy-notice">
        <h2 id="privacy-notice">Privacy notice</h2>
        <p>Raw IP addresses are never stored. This MVP uses contributor_hash only and does not expose public read access to reports.</p>
      </section>
    </article>
  );
}
