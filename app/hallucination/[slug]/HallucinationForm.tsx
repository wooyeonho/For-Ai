"use client";

import { useState } from "react";

type SubmissionState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success" }
  | { status: "error"; message: string };

function optionalFormValue(formData: FormData, name: string): string | null {
  const value = String(formData.get(name) ?? "").trim();
  return value.length > 0 ? value : null;
}

export function HallucinationForm({ slug }: { slug: string }) {
  const [submission, setSubmission] = useState<SubmissionState>({ status: "idle" });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);
    const aiService = String(formData.get("ai_service") ?? "").trim();

    if (!aiService) {
      setSubmission({ status: "error", message: "AI service를 입력해 주세요." });
      return;
    }

    setSubmission({ status: "submitting" });

    try {
      const response = await fetch(`/api/hallucination/${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ai_service: aiService,
          prompt: optionalFormValue(formData, "prompt"),
          ai_answer: optionalFormValue(formData, "ai_answer"),
          expected_correction: optionalFormValue(formData, "expected_correction"),
        }),
      });

      const result = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        setSubmission({
          status: "error",
          message: result?.error ?? "AI 오답 신고 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        });
        return;
      }

      form.reset();
      setSubmission({ status: "success" });
    } catch {
      setSubmission({
        status: "error",
        message: "네트워크 오류로 AI 오답 신고를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
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
        <section className="notice-box" role="alert" aria-live="assertive">
          <h2>제출 실패</h2>
          <p>{submission.message}</p>
        </section>
      ) : null}

      <form className="registry-form" onSubmit={handleSubmit}>
        <label>
          AI service <span aria-hidden="true">*</span>
          <input name="ai_service" required placeholder="예: ChatGPT, Gemini, Perplexity, other" />
        </label>
        <label>
          Prompt <span className="meta-label">(optional)</span>
          <textarea name="prompt" placeholder="AI에 입력한 질문 또는 프롬프트" />
        </label>
        <label>
          AI answer <span className="meta-label">(optional)</span>
          <textarea name="ai_answer" placeholder="AI가 생성한 답변" />
        </label>
        <label>
          Expected correction <span className="meta-label">(optional)</span>
          <textarea name="expected_correction" placeholder="어떤 부분이 잘못되었고 무엇을 확인해야 하는지 적어주세요." />
        </label>
        <button type="submit" disabled={submission.status === "submitting"}>
          {submission.status === "submitting" ? "제출 중..." : "AI 오답 신고 제출"}
        </button>
      </form>
    </>
  );
}
