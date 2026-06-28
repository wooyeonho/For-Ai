import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getRegistryBundleBySlug } from "../../../lib/data";
import { getRegistryBundleFromSupabase } from "../../../lib/supabase-documents";
import { createReportSubmissionStub } from "../../../lib/submission-stubs";

export const metadata: Metadata = {
  title: "정정 제보",
  description: "레지스트리 문서의 claim에 대한 정정을 제보합니다.",
};

export default async function ReportPage({
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
        <p className="eyebrow">Correction report</p>
        <h1>Document not found</h1>
        <p>요청한 문서를 찾을 수 없습니다.</p>
      </section>
    );
  }

  const { entity, document, claims } = bundle;

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
        <h2 id="report-form-title">정정 요청</h2>
        <p>확인이 필요한 claim에 대해 정정 요청을 남겨주세요. 로그인은 필요하지 않습니다.</p>
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
            정정 요청 내용
            <textarea name="message" required minLength={5} placeholder="어떤 claim이 정정되어야 하는지 적어주세요." />
          </label>
          <input type="hidden" name="contributor_hash" value="local-stub-contributor-hash" />
          <button type="submit">정정 요청 제출</button>
        </form>
      </section>

      <section className="notice-box" aria-labelledby="privacy-notice">
        <h2 id="privacy-notice">Privacy notice</h2>
        <p>Raw IP addresses are never stored. This MVP uses contributor_hash only and does not expose public read access to reports.</p>
      </section>
    </article>
  );
}
