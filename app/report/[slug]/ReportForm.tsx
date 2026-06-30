"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { isValidLocale } from "@/lib/i18n";
import { REPORT_MESSAGE_MAX_LENGTH } from "@/lib/submission-limits";

type ClaimOption = {
  id: string;
  field_path: string;
  claim_text: string;
};

type ReportIntent = "correction" | "source" | "notify";

export function ReportForm({
  documentId,
  entityId,
  slug,
  claims,
  intent = "correction",
}: {
  documentId: string;
  entityId: string;
  slug: string;
  claims: ClaimOption[];
  intent?: ReportIntent;
}) {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pointsAwarded, setPointsAwarded] = useState<number | null>(null);
  const searchParams = useSearchParams();
  const returnUrl = useMemo(() => {
    const explicitReturn = searchParams.get("return");
    if (explicitReturn?.startsWith("/") && !explicitReturn.startsWith("//")) {
      return explicitReturn;
    }

    const queryLocale = searchParams.get("lang");
    if (queryLocale && isValidLocale(queryLocale)) {
      return `/${queryLocale}/wiki/${slug}`;
    }

    return `/en/wiki/${slug}`;
  }, [searchParams, slug]);

  const copy = useMemo(() => {
    if (intent === "source") {
      return {
        typeLabel: "Source contribution",
        messageLabel: "Source notes",
        sourceLabel: "Official source URL or citation",
        placeholder: "Explain which claim this source supports. Unknown facts remain Needs verification until human review.",
        button: "Submit source candidate",
        success: "출처 후보가 접수되었습니다. 낮은 기본 점수만 기록되며, claim truth는 관리자 검증으로만 결정됩니다.",
      };
    }
    if (intent === "notify") {
      return {
        typeLabel: "Notification request",
        messageLabel: "Notification request",
        sourceLabel: "Optional related source URL",
        placeholder: "Which claim should we notify you about when it is verified? Do not include sensitive personal information.",
        button: "Request notification",
        success: "알림 요청이 접수되었습니다. 검토 큐에 안전하게 기록됩니다.",
      };
    }
    return {
      typeLabel: "Correction report",
      messageLabel: "정정 요청 내용",
      sourceLabel: "Optional source URL or citation",
      placeholder: "어떤 claim이 정정되어야 하는지, 근거가 있다면 함께 알려주세요.",
      button: "정정 요청 제출",
      success: "신고가 접수되었습니다. 검토 후 반영됩니다.",
    };
  }, [intent]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    setLoading(true);
    setError("");
    setPointsAwarded(null);

    try {
      const response = await fetch(`/api/report/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document_id: documentId,
          entity_id: entityId,
          report_type: formData.get("report_type"),
          field_path: formData.get("field_path"),
          claim_id: formData.get("claim_id"),
          source_url: formData.get("source_url"),
          source_title: formData.get("source_title"),
          citation: formData.get("citation"),
          message: formData.get("message"),
          honeypot: formData.get("website"),
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        setSubmitted(true);
        setPointsAwarded(typeof data?.points_awarded === "number" ? data.points_awarded : null);
        form.reset();
      } else {
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
        <p>{copy.success}</p>
        {pointsAwarded !== null ? <p className="meta-label">points awarded: {pointsAwarded}</p> : null}
        <a href={returnUrl} className="cta-link">
          문서로 돌아가기
        </a>
      </div>
    );
  }

  return (
    <form className="report-form registry-form" onSubmit={handleSubmit}>
      <input type="hidden" name="report_type" value={intent === "source" ? "source_candidate" : intent} />
      <label className="visually-hidden" aria-hidden="true">
        Website
        <input name="website" tabIndex={-1} autoComplete="off" />
      </label>

      <div className="form-field">
        <label htmlFor="claim_id">Claim 선택</label>
        <select id="claim_id" name="claim_id" defaultValue="">
          <option value="">전체 문서 또는 직접 설명</option>
          {claims.map((claim) => (
            <option value={claim.id} key={claim.id}>{claim.field_path}</option>
          ))}
        </select>
      </div>

      <div className="form-field">
        <label htmlFor="field_path">Field path</label>
        <input id="field_path" name="field_path" placeholder="예: parking.fee" />
      </div>

      <div className="form-field">
        <label htmlFor="source_url">{copy.sourceLabel}</label>
        <input id="source_url" name="source_url" type="url" inputMode="url" placeholder="https://..." required={intent === "source"} />
      </div>

      <div className="form-field">
        <label htmlFor="source_title">Source title / publisher</label>
        <input id="source_title" name="source_title" placeholder="Issuing organization or page title" />
      </div>

      <div className="form-field">
        <label htmlFor="citation">Citation text</label>
        <input id="citation" name="citation" placeholder="Optional short citation or document section" />
      </div>

      <div className="form-field">
        <label htmlFor="message">{copy.messageLabel}</label>
        <textarea
          id="message"
          name="message"
          required
          rows={5}
          minLength={5}
          maxLength={REPORT_MESSAGE_MAX_LENGTH}
          placeholder={copy.placeholder}
        />
      </div>

      <p className="meta-label">점수는 기여 활동 보상일 뿐이며 claim truth, confidence, verified status를 결정하지 않습니다.</p>

      {error && (
        <div className="semantic-alert semantic-alert-danger">{error}</div>
      )}

      <button type="submit" className="form-submit" disabled={loading}>
        {loading ? "제출 중..." : copy.button}
      </button>
    </form>
  );
}
