"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { HALLUCINATION_FIELD_MAX_LENGTHS } from "@/lib/submission-limits";

export function HallucinationForm({
  documentId,
  entityId,
  slug,
}: {
  documentId: string;
  entityId: string;
  slug: string;
}) {
  const searchParams = useSearchParams();
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const lang = searchParams.get("lang") || "en";
  const returnParam = searchParams.get("return");
  const returnHref = returnParam && returnParam.startsWith("/") && !returnParam.startsWith("//")
    ? returnParam
    : `/${lang}/wiki/${slug}`;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/hallucination/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document_id: documentId,
          entity_id: entityId,
          ai_service: formData.get("ai_service"),
          prompt: formData.get("prompt"),
          ai_answer: formData.get("ai_answer"),
          expected_correction: formData.get("expected_correction"),
        }),
      });

      if (response.ok) {
        setSubmitted(true);
        window.location.assign(returnHref);
      } else {
        const data = await response.json().catch(() => ({}));
        setError("제출 실패: " + (data?.error ?? response.status));
      }
    } catch {
      setError("네트워크 오류. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="submission-success">
        <p>AI 오답 신고가 접수되었습니다. 검토 후 반영됩니다.</p>
        <a href={returnHref} className="cta-link">
          문서로 돌아가기
        </a>
      </div>
    );
  }

  return (
    <form className="report-form" onSubmit={handleSubmit}>
      <div className="form-field">
        <label htmlFor="ai_service">AI 서비스</label>
        <input
          type="text"
          id="ai_service"
          name="ai_service"
          required
          maxLength={HALLUCINATION_FIELD_MAX_LENGTHS.ai_service}
          placeholder="예: ChatGPT, Claude, Gemini, Perplexity"
        />
      </div>

      <div className="form-field">
        <label htmlFor="prompt">질문 (프롬프트)</label>
        <textarea
          id="prompt"
          name="prompt"
          rows={3}
          maxLength={HALLUCINATION_FIELD_MAX_LENGTHS.prompt}
          placeholder="AI에게 어떤 질문을 했나요?"
        />
      </div>

      <div className="form-field">
        <label htmlFor="ai_answer">AI의 잘못된 답변</label>
        <textarea
          id="ai_answer"
          name="ai_answer"
          required
          rows={4}
          maxLength={HALLUCINATION_FIELD_MAX_LENGTHS.ai_answer}
          placeholder="AI가 어떤 답변을 했나요?"
        />
      </div>

      <div className="form-field">
        <label htmlFor="expected_correction">올바른 정보</label>
        <textarea
          id="expected_correction"
          name="expected_correction"
          rows={3}
          maxLength={HALLUCINATION_FIELD_MAX_LENGTHS.expected_correction}
          placeholder="실제로 올바른 정보가 무엇인지 알려주세요."
        />
      </div>

      {error && (
        <div className="semantic-alert semantic-alert-danger">{error}</div>
      )}

      <button type="submit" className="form-submit" disabled={loading}>
        {loading ? "제출 중..." : "오답 신고 제출"}
      </button>
    </form>
  );
}
