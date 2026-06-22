import { redirect } from "next/navigation";
import { getRegistryBundleBySlug } from "../../../lib/data";
import { createHallucinationReportStub } from "../../../lib/submission-stubs";

export default async function HallucinationPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ submitted?: string }>;
}) {
  const { slug } = await params;
  const { submitted } = await searchParams;
  const bundle = getRegistryBundleBySlug(slug);

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

  async function submitHallucinationReport(formData: FormData) {
    "use server";

    createHallucinationReportStub({
      document_id: document.id,
      entity_id: entity.id,
      ai_service: String(formData.get("ai_service") ?? "unknown").trim() || "unknown",
      prompt: String(formData.get("prompt") ?? "").trim() || null,
      ai_answer: String(formData.get("ai_answer") ?? "").trim() || null,
      expected_correction: String(formData.get("expected_correction") ?? "").trim() || null,
    });

    redirect(`/hallucination/${document.slug}?submitted=1`);
  }

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
          <p>AI 오답 신고가 접수 대기 상태로 처리되었습니다. 현재 MVP에서는 저장소에 기록하지 않는 안전한 stub 응답입니다.</p>
        </section>
      ) : null}

      <section className="registry-panel" aria-labelledby="hallucination-form-title">
        <h2 id="hallucination-form-title">AI 오답 신고</h2>
        <p>AI 서비스가 GYEOL 문서와 다른 답변을 생성했다면 신고해 주세요. AI 서비스 이름은 자유 입력입니다.</p>
        <form action={submitHallucinationReport} className="registry-form">
          <label>
            AI service
            <input name="ai_service" required placeholder="예: ChatGPT, Gemini, Perplexity, other" />
          </label>
          <label>
            Prompt
            <textarea name="prompt" placeholder="AI에 입력한 질문 또는 프롬프트" />
          </label>
          <label>
            AI answer
            <textarea name="ai_answer" placeholder="AI가 생성한 답변" />
          </label>
          <label>
            Expected correction
            <textarea name="expected_correction" placeholder="어떤 부분이 잘못되었고 무엇을 확인해야 하는지 적어주세요." />
          </label>
          <input type="hidden" name="contributor_hash" value="local-stub-contributor-hash" />
          <button type="submit">AI 오답 신고 제출</button>
        </form>
      </section>

      <section className="notice-box" aria-labelledby="privacy-notice">
        <h2 id="privacy-notice">Privacy notice</h2>
        <p>Raw IP addresses are never stored. This MVP uses contributor_hash only and does not expose public read access to hallucination reports.</p>
      </section>
    </article>
  );
}
