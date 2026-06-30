"use client";

import { useMemo, useState } from "react";
import { REPORT_MESSAGE_MAX_LENGTH } from "@/lib/submission-limits";
import type { SupportedLocale } from "@/lib/i18n/locales";
import type { UITranslations } from "@/lib/i18n/translations";

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
  locale,
  translations,
  intent = "correction",
}: {
  documentId: string;
  entityId: string;
  slug: string;
  claims: ClaimOption[];
  intent?: ReportIntent;
  locale: SupportedLocale;
  translations: UITranslations["actionForms"];
}) {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pointsAwarded, setPointsAwarded] = useState<number | null>(null);

  const copy = useMemo(() => {
    if (intent === "source") {
      return {
        typeLabel: translations.sourceContribution,
        messageLabel: translations.sourceNotes,
        sourceLabel: translations.officialSource,
        placeholder: translations.sourcePlaceholder,
        button: translations.submitSourceCandidate,
        success: translations.sourceSuccess,
      };
    }
    if (intent === "notify") {
      return {
        typeLabel: translations.notificationRequest,
        messageLabel: translations.notificationRequest,
        sourceLabel: translations.optionalRelatedSource,
        placeholder: translations.notifyPlaceholder,
        button: translations.requestNotification,
        success: translations.notifySuccess,
      };
    }
    return {
      typeLabel: translations.correctionReport,
      messageLabel: translations.correctionMessage,
      sourceLabel: translations.optionalSource,
      placeholder: translations.correctionPlaceholder,
      button: translations.submitCorrection,
      success: translations.correctionSuccess,
    };
  }, [intent, translations]);

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
        setError(`${translations.submitFailed}: ${data?.error ?? response.status}`);
      }
    } catch {
      setError(translations.networkError);
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="submission-success">
        <p>{copy.success}</p>
        {pointsAwarded !== null ? <p className="meta-label">points awarded: {pointsAwarded}</p> : null}
        <a href={`/${locale}/wiki/${slug}`} className="cta-link">
          {translations.backToDocument}
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
        <label htmlFor="claim_id">{translations.claimSelect}</label>
        <select id="claim_id" name="claim_id" defaultValue="">
          <option value="">{translations.wholeDocument}</option>
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
        <label htmlFor="source_title">{translations.sourceTitle}</label>
        <input id="source_title" name="source_title" placeholder="Issuing organization or page title" />
      </div>

      <div className="form-field">
        <label htmlFor="citation">{translations.citationText}</label>
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

      <p className="meta-label">{translations.contributionPointsNotice}</p>

      {error && (
        <div className="semantic-alert semantic-alert-danger">{error}</div>
      )}

      <button type="submit" className="form-submit" disabled={loading}>
        {loading ? translations.submitting : copy.button}
      </button>
    </form>
  );
}
