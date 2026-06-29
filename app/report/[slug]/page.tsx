import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getRegistryBundleBySlug } from "../../../lib/data";
import { getRegistryBundleFromSupabase } from "../../../lib/supabase-documents";
import { createReportSubmissionStub } from "../../../lib/submission-stubs";
import { REPORT_MESSAGE_MAX_LENGTH } from "../../../lib/submission-limits";

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
  const messagePlaceholder = isSourceIntent
    ? "Official source URL, issuing organization, and which claim it supports."
    : isNotifyIntent
      ? "Which claim should we notify you about when it is verified? Do not include sensitive personal information."
      : "어떤 claim이 정정되어야 하는지 적어주세요.";

  async function submitReport(formData: FormData) {
    "use server";

    const fieldPath = String(formData.get("field_path") ?? "").trim() || null;
    const message = String(formData.get("message") ?? "").trim();

    createReportSubmissionStub({
      document_id: document.id,
      entity_id: entity.id,
      field_path: fieldPath,
      message,
    });

    redirect(`/report/${document.slug}?submitted=1`);
  }

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
        <form action={submitReport} className="registry-form">
          <label>
            Field path 선택 또는 입력
            <select name="field_path" defaultValue="">
              <option value="">전체 문서 또는 직접 설명</option>
              {claims.map((claim) => (
                <option value={claim.field_path} key={claim.id}>{claim.field_path}</option>
              ))}
            </select>
          </label>
          <label>
            {isSourceIntent ? "Official source details" : isNotifyIntent ? "Notification request" : "정정 요청 내용"}
            <textarea name="message" required minLength={5} maxLength={REPORT_MESSAGE_MAX_LENGTH} placeholder={messagePlaceholder} />
          </label>
          <input type="hidden" name="contributor_hash" value="local-stub-contributor-hash" />
          <button type="submit">{isSourceIntent ? "Submit official source" : isNotifyIntent ? "Request notification" : "정정 요청 제출"}</button>
        </form>
      </section>

      <section className="notice-box" aria-labelledby="privacy-notice">
        <h2 id="privacy-notice">Privacy notice</h2>
        <p>Raw IP addresses are never stored. This MVP uses contributor_hash only and does not expose public read access to reports.</p>
      </section>
    </article>
  );
}
