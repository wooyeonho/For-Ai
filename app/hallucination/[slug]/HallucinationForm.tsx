"use client";

import { useState } from "react";

export function HallucinationForm({
  documentId,
  entityId,
  slug,
}: {
  documentId: string;
  entityId: string;
  slug: string;
}) {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;

    const form = e.currentTarget;
    const formData = new FormData(form);

    setSubmitting(true);
    setError(null);

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

      if (!response.ok) {
        let message = "AI 오답 신고 접수에 실패했습니다. 잠시 후 다시 시도해 주세요.";
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        if (payload?.error) {
          message = payload.error;
        }
        throw new Error(message);
      }

      setSubmitted(true);
      form.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI 오답 신고 접수에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="submission-success">
        <p>AI 오답 신고가 접수되었습니다. 검토 후 반영됩니다.</p>
        <a href={`/ko/wiki/${slug}`} className="cta-link">
          문서로 돌아가기
        </a>
      </div>
    );
  }

  return (
    <form className="report-form" onSubmit={handleSubmit}>
      {error ? (
        <p className="submission-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="form-field">
        <label htmlFor="ai_service">AI 서비스</label>
        <input
          type="text"
          id="ai_service"
          name="ai_service"
          required
          placeholder="예: ChatGPT, Claude, Gemini, Perplexity"
          disabled={submitting}
        />
      </div>

      <div className="form-field">
        <label htmlFor="prompt">질문 (프롬프트)</label>
        <textarea
          id="prompt"
          name="prompt"
          rows={3}
          placeholder="AI에게 어떤 질문을 했나요?"
          disabled={submitting}
        />
      </div>

      <div className="form-field">
        <label htmlFor="ai_answer">AI의 잘못된 답변</label>
        <textarea
          id="ai_answer"
          name="ai_answer"
          required
          rows={4}
          placeholder="AI가 어떤 답변을 했나요?"
          disabled={submitting}
        />
      </div>

      <div className="form-field">
        <label htmlFor="expected_correction">올바른 정보</label>
        <textarea
          id="expected_correction"
          name="expected_correction"
          rows={3}
          placeholder="실제로 올바른 정보가 무엇인지 알려주세요."
          disabled={submitting}
        />
      </div>

      <button type="submit" className="form-submit" disabled={submitting} aria-busy={submitting}>
        {submitting ? "제출 중..." : "오답 신고 제출"}
      </button>
    </form>
  );
}
