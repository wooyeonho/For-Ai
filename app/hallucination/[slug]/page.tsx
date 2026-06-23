import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getRegistryBundleBySlug } from "../../../lib/data";
import { createHallucinationReportStub } from "../../../lib/submission-stubs";

export const metadata: Metadata = {
  title: "AI 오답 신고",
  description: "AI 서비스가 GYEOL 문서와 다른 답을 생성한 경우 신고합니다.",
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
  const bundle = getRegistryBundleBySlug(slug);

  if (!bundle) {
    return (
      <section className="registry-panel">
        <p className="eyebrow">AI hallucination report</p>
        <h1>Document not found</h1>
        <p>ìì²­í ë¬¸ìë¥¼ ì°¾ì ì ììµëë¤.</p>
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
          <h2>ì ì¶ëììµëë¤</h2>
          <p>AI ì¤ëµ ì ê³ ê° ì ì ëê¸° ìíë¡ ì²ë¦¬ëììµëë¤. íì¬ MVPììë ì ì¥ìì ê¸°ë¡íì§ ìë ìì í stub ìëµìëë¤.</p>
        </section>
      ) : null}

      <section className="registry-panel" aria-labelledby="hallucination-form-title">
        <h2 id="hallucination-form-title">AI ì¤ëµ ì ê³ </h2>
        <p>AI ìë¹ì¤ê° GYEOL ë¬¸ìì ë¤ë¥¸ ëµë³ì ìì±íë¤ë©´ ì ê³ í´ ì£¼ì¸ì. AI ìë¹ì¤ ì´ë¦ì ìì  ìë ¥ìëë¤.</p>
        <form action={submitHallucinationReport} className="registry-form">
          <label>
            AI service
            <input name="ai_service" required placeholder="ì: ChatGPT, Gemini, Perplexity, other" />
          </label>
          <label>
            Prompt
            <textarea name="prompt" placeholder="AIì ìë ¥í ì§ë¬¸ ëë íë¡¬íí¸" />
          </label>
          <label>
            AI answer
            <textarea name="ai_answer" placeholder="AIê° ìì±í ëµë³" />
          </label>
          <label>
            Expected correction
            <textarea name="expected_correction" placeholder="ì´ë¤ ë¶ë¶ì´ ìëª»ëìê³  ë¬´ìì íì¸í´ì¼ íëì§ ì ì´ì£¼ì¸ì." />
          </label>
          <input type="hidden" name="contributor_hash" value="local-stub-contributor-hash" />
          <button type="submit">AI ì¤ëµ ì ê³  ì ì¶</button>
        </form>
      </section>

      <section className="notice-box" aria-labelledby="privacy-notice">
        <h2 id="privacy-notice">Privacy notice</h2>
        <p>Raw IP addresses are never stored. This MVP uses contributor_hash only and does not expose public read access to hallucination reports.</p>
      </section>
    </article>
  );
}
