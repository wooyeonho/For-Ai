"use client";

import { useState } from "react";

type SubmissionState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success" }
  | { status: "error"; message: string };

function optionalText(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function HallucinationForm({ slug }: { slug: string }) {
  const [submission, setSubmission] = useState<SubmissionState>({ status: "idle" });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);
    const aiService = optionalText(formData.get("ai_service"));

    if (!aiService) {
      setSubmission({ status: "error", message: "AI service는 필수입니다." });
      return;
    }

    setSubmission({ status: "submitting" });

    try {
      const response = await fetch(`/api/hallucination/${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ai_service: aiService,
          prompt: optionalText(formData.get("prompt")),
          ai_answer: optionalText(formData.get("ai_answer")),
          expected_correction: optionalText(formData.get("expected_correction")),
        }),
      });

      const result = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        setSubmission({
          status: "error",
          message: result?.error ?? "AI 오답 신고 저장에 실패했습니다.",
        });
        return;
      }

      form.reset();
      setSubmission({ status: "success" });
    } catch {
      setSubmission({
        status: "error",
        message: "네트워크 오류로 AI 오답 신고를 저장하지 못했습니다.",
      });
    }
  }

  return (
    <>
      {submission.status === "success" ? (
        <section className="notice-box success-box" aria-live="polite">
          <h2>제출되었습니다</h2>
          <p>AI 오답 신고가 저장되었습니다. 검토 후 반영됩니다.</p>
        </section>
      ) : null}

      {submission.status === "error" ? (
        <section className="notice-box" aria-live="assertive">
          <h2>제출 실패</h2>
          <p>{submission.message}</p>
        </section>
      ) : null}

      <form onSubmit={handleSubmit} className="registry-form">
        <label>
          AI service <span aria-hidden="true">*</span>
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
        <button type="submit" disabled={submission.status === "submitting"}>
          {submission.status === "submitting" ? "제출 중..." : "AI 오답 신고 제출"}
        </button>
      </form>
    </>
  );
}
