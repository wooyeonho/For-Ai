"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { REPORT_MESSAGE_MAX_LENGTH } from "@/lib/submission-constants";
import { isValidLocale } from "@/lib/i18n/locales";

type ClaimOption = {
  id: string;
  field_path: string;
  claim_text: string;
};

type ReportIntent = "correction" | "source" | "notify" | "reply";

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
  const [search, setSearch] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pointsAwarded, setPointsAwarded] = useState<number | null>(null);
  useEffect(() => {
    setSearch(window.location.search);
  }, []);

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
    if (intent === "reply") {
      return {
        typeLabel: "Right of reply",
        messageLabel: "Your response",
        sourceLabel: "Optional supporting source URL",
        placeholder: "Identify the claim and provide a factual response for operator review. Do not include secrets or unrelated personal data.",
        button: "Submit right of reply",
        success: "Your right-of-reply request was received for private operator review.",
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
  const returnHref = useMemo(() => {
    const searchParams = new URLSearchParams(search);
    const requestedReturn = searchParams.get("return");
    if (requestedReturn?.startsWith("/") && !requestedReturn.startsWith("//")) {
      return requestedReturn;
    }

    const lang = searchParams.get("lang");
    return isValidLocale(lang ?? "") ? `/${lang}/wiki/${slug}` : `/en/wiki/${slug}`;
  }, [search, slug]);

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
          issue_category: formData.get("issue_category"),
          field_path: formData.get("field_path"),
          claim_id: formData.get("claim_id"),
          source_url: formData.get("source_url"),
          source_title: formData.get("source_title"),
          citation: formData.get("citation"),
          message: formData.get("message"),
          reporter_contact: formData.get("reporter_contact"),
          contact_consent: formData.get("contact_consent") === "on",
          honeypot: formData.get("website"),
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        setSubmitted(true);
        setPointsAwarded(typeof data?.points_awarded === "number" ? data.points_awarded : null);
        form.reset();
        window.location.assign(returnHref);
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
        <a href={returnHref} className="cta-link">
          문서로 돌아가기
        </a>
        {" · "}
        <Link href="/contribute/mine" className="cta-link">
          내 제출 확인하기 →
        </Link>
      </div>
    );
  }

  return (
    <form className="report-form registry-form" onSubmit={handleSubmit}>
      <input type="hidden" name="report_type" value={intent === "source" ? "source_candidate" : intent === "reply" ? "right_of_reply" : intent} />
      <label className="visually-hidden" aria-hidden="true">
        Website
        <input name="website" tabIndex={-1} autoComplete="off" />
      </label>

      <div className="form-field">
        <label htmlFor="claim_id">Claim 선택</label>
        <select id="claim_id" name="claim_id" defaultValue="" required={intent === "correction" || intent === "reply"}>
          <option value="">전체 문서 또는 직접 설명</option>
          {claims.map((claim) => (
            <option value={claim.id} key={claim.id}>{claim.field_path}</option>
          ))}
        </select>
      </div>

      {(intent === "correction" || intent === "reply") && (
        <div className="form-field">
          <label htmlFor="issue_category">Issue category</label>
          <select id="issue_category" name="issue_category" defaultValue={intent === "reply" ? "right_of_reply" : "incorrect"}>
            <option value="incorrect">Incorrect</option>
            <option value="outdated">Outdated</option>
            <option value="unsupported">Unsupported by the cited source</option>
            <option value="harmful">Potentially harmful</option>
            <option value="privacy">Privacy concern</option>
            <option value="legal">Legal concern</option>
            <option value="right_of_reply">Right of reply</option>
            <option value="other">Other</option>
          </select>
        </div>
      )}

      <div className="form-field">
        <label htmlFor="field_path">Field path</label>
        <input id="field_path" name="field_path" placeholder="예: parking.fee" />
      </div>

      {(intent === "correction" || intent === "reply") && (
        <>
          <div className="form-field">
            <label htmlFor="reporter_contact">Private contact (optional)</label>
            <input
              id="reporter_contact"
              name="reporter_contact"
              type="text"
              maxLength={254}
              autoComplete="email"
              placeholder="Email or another contact method"
            />
          </div>
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <input type="checkbox" name="contact_consent" />
            <span className="meta-label">
              If I provide contact details, I consent to private storage for up to 90 days so an operator can follow up. Contact details are never public.
            </span>
          </label>
        </>
      )}

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

      <p className="meta-label">Reports never change publication or verification status automatically. An authorized operator must review and act.</p>

      {error && (
        <div className="semantic-alert semantic-alert-danger">{error}</div>
      )}

      <button type="submit" className="form-submit" disabled={loading}>
        {loading ? "제출 중..." : copy.button}
      </button>
    </form>
  );
}
