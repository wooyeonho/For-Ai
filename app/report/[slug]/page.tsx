import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getRegistryBundleBySlug } from "../../../lib/data";
import { saveCorrectionReportForRequest } from "../../../lib/report-storage";

export const metadata: Metadata = {
  title: "정정 제보",
  description: "레지스트리 문서의 claim에 대한 정정을 제보합니다.",
};

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ status?: string; message?: string }>;
}) {
  const { slug } = await params;
  const { status, message } = await searchParams;
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

  async function submitReport(formData: FormData) {
    "use server";

    const message = String(formData.get("message") ?? "").trim();
    const requestHeaders = new Headers(await headers());
    const syntheticRequest = new Request(`https://for-ai.local/report/${document.slug}`, {
      headers: requestHeaders,
    });

    const result = await saveCorrectionReportForRequest(syntheticRequest, {
      slug: document.slug,
      message,
      report_type: "correction",
    });

    if (!result.ok) {
      redirect(
        `/report/${document.slug}?status=error&message=${encodeURIComponent(result.error)}`
      );
    }

    redirect(`/report/${document.slug}?status=success`);
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

      {status === "success" ? (
        <section className="notice-box success-box" aria-live="polite">
          <h2>접수되었습니다</h2>
          <p>정정 요청이 저장소에 접수되었습니다. 검토 대기 상태로 처리됩니다.</p>
        </section>
      ) : null}

      {status === "error" ? (
        <section className="notice-box" aria-live="polite" role="alert">
          <h2>접수되지 않았습니다</h2>
          <p>{message || "정정 요청을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요."}</p>
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
          <button type="submit">정정 요청 제출</button>
        </form>
      </section>

      <section className="notice-box" aria-labelledby="privacy-notice">
        <h2 id="privacy-notice">Privacy notice</h2>
        <p>Raw IP addresses are never stored. The server generates contributor_hash from request metadata only and does not expose public read access to reports.</p>
      </section>
    </article>
  );
}
