"use client";

import { useState } from "react";
import { REPORT_MESSAGE_MAX_LENGTH } from "@/lib/submission-limits";

export function ReportForm({
  documentId,
  entityId,
  slug,
}: {
  documentId: string;
  entityId: string;
  slug: string;
}) {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/report/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document_id: documentId,
          entity_id: entityId,
          report_type: formData.get("report_type"),
          message: formData.get("message"),
        }),
      });

      if (response.ok) {
        setSubmitted(true);
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
        <p>신고가 접수되었습니다. 검토 후 반영됩니다.</p>
        <a href={`/en/wiki/${slug}`} className="cta-link">
          문서로 돌아가기
        </a>
      </div>
    );
  }

  return (
    <form className="report-form" onSubmit={handleSubmit}>
      <div className="form-field">
        <label htmlFor="report_type">신고 유형</label>
        <select id="report_type" name="report_type" required>
          <option value="incorrect_fact">사실 오류</option>
          <option value="outdated">정보 업데이트 필요</option>
          <option value="missing_info">누락된 정보</option>
          <option value="other">기타</option>
        </select>
      </div>

      <div className="form-field">
        <label htmlFor="message">상세 내용</label>
        <textarea
          id="message"
          name="message"
          required
          rows={5}
          maxLength={REPORT_MESSAGE_MAX_LENGTH}
          placeholder="어떤 정보가 잘못되었는지, 올바른 정보는 무엇인지 알려주세요."
        />
      </div>

      {error && (
        <div className="semantic-alert semantic-alert-danger">{error}</div>
      )}

      <button type="submit" className="form-submit" disabled={loading}>
        {loading ? "제출 중..." : "신고 제출"}
      </button>
    </form>
  );
}
