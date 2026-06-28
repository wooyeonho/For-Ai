"use client";

import { useState } from "react";

const SUCCESS_MESSAGE = "접수되었습니다. 검토 대기 상태로 처리되며, 저장소 설정에 따라 DB 또는 안전한 stub으로 기록됩니다.";

type HallucinationFormProps = {
  slug: string;
};

export function HallucinationForm({ slug }: HallucinationFormProps) {
  const [status, setStatus] = useState<"idle" | "submitting" | "submitted" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);

    setStatus("submitting");
    setErrorMessage(null);

    const response = await fetch(`/api/hallucination/${slug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ai_service: formData.get("ai_service"),
        prompt: formData.get("prompt"),
        ai_answer: formData.get("ai_answer"),
        expected_correction: formData.get("expected_correction"),
      }),
    });

    if (response.ok) {
      setStatus("submitted");
      form.reset();
      return;
    }

    const body = await response.json().catch(() => null);
    setErrorMessage(body?.error ?? "제출 중 오류가 발생했습니다.");
    setStatus("error");
  }

  if (status === "submitted") {
    return (
      <div className="notice-box success-box" aria-live="polite">
        <h2>제출되었습니다</h2>
        <p>{SUCCESS_MESSAGE}</p>
        <a href={`/ko/wiki/${slug}`} className="cta-link">
          문서로 돌아가기
        </a>
      </div>
    );
  }

  return (
    <form className="registry-form" onSubmit={handleSubmit}>
      <label>
        AI service
        <input name="ai_service" required placeholder="예: ChatGPT, Claude, Gemini, Perplexity, other" />
      </label>

      <label>
        Prompt
        <textarea name="prompt" rows={3} placeholder="AI에 입력한 질문 또는 프롬프트" />
      </label>

      <label>
        AI answer
        <textarea name="ai_answer" required rows={4} placeholder="AI가 생성한 잘못된 답변" />
      </label>

      <label>
        Expected correction
        <textarea name="expected_correction" rows={3} placeholder="어떤 부분이 잘못되었고 무엇을 확인해야 하는지 적어주세요." />
      </label>

      {status === "error" ? (
        <p className="error-text" role="alert">{errorMessage}</p>
      ) : null}

      <button type="submit" disabled={status === "submitting"}>
        {status === "submitting" ? "제출 중..." : "AI 오답 신고 제출"}
      </button>
    </form>
  );
}
