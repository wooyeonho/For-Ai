"use client";

import { useState } from "react";

const SUCCESS_MESSAGE = "접수되었습니다. 검토 대기 상태로 처리되며, 저장소 설정에 따라 DB 또는 안전한 stub으로 기록됩니다.";

type ReportFormProps = {
  slug: string;
};

export function ReportForm({ slug }: ReportFormProps) {
  const [status, setStatus] = useState<"idle" | "submitting" | "submitted" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);

    setStatus("submitting");
    setErrorMessage(null);

    const response = await fetch(`/api/report/${slug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        report_type: formData.get("report_type"),
        message: formData.get("message"),
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
        신고 유형
        <select name="report_type" required defaultValue="correction">
          <option value="correction">정정 요청</option>
          <option value="incorrect_fact">사실 오류</option>
          <option value="outdated">정보 업데이트 필요</option>
          <option value="missing_info">누락된 정보</option>
          <option value="other">기타</option>
        </select>
      </label>

      <label>
        상세 내용
        <textarea
          name="message"
          required
          minLength={5}
          rows={5}
          placeholder="어떤 claim이 정정되어야 하는지, 확인 가능한 근거가 있다면 함께 적어주세요."
        />
      </label>

      {status === "error" ? (
        <p className="error-text" role="alert">{errorMessage}</p>
      ) : null}

      <button type="submit" disabled={status === "submitting"}>
        {status === "submitting" ? "제출 중..." : "정정 요청 제출"}
      </button>
    </form>
  );
}
