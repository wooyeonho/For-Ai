"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { getTranslations } from "../../../lib/i18n";
import type { SupportedLocale } from "../../../lib/i18n";
import { presentationForUnknown } from "../../../lib/citation-presentation";

type CheckMatch = {
  claim_id: string;
  document_slug: string;
  claim_text: string;
  status: string;
  confidence: string;
  similarity: number;
};

type SentenceResult = {
  sentence: string;
  match: CheckMatch | null;
  no_match_reason: string | null;
};

type CheckSummary = {
  total: number;
  verified: number;
  needs_review: number;
  disputed: number;
  not_found: number;
};

type CheckResponse = {
  sentences: SentenceResult[];
  summary: CheckSummary;
};

type CheckState = "idle" | "checking" | "done" | "error";

function formatCount(template: string, count: number): string {
  return template.replace("{count}", String(count));
}

function mapErrorToKey(error: string | undefined): "errorTextTooLong" | "errorTooManySentences" | "errorNoAnalyzableSentences" | "errorRateLimited" | "errorGeneric" {
  switch (error) {
    case "text_too_long":
      return "errorTextTooLong";
    case "too_many_sentences":
      return "errorTooManySentences";
    case "no_analyzable_sentences":
      return "errorNoAnalyzableSentences";
    case "rate_limited":
      return "errorRateLimited";
    default:
      return "errorGeneric";
  }
}

export default function CheckClient({ locale }: { locale: SupportedLocale }) {
  const t = getTranslations(locale).check;
  const tCitation = getTranslations(locale).citation;
  const [text, setText] = useState("");
  const [state, setState] = useState<CheckState>("idle");
  const [result, setResult] = useState<CheckResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "success" | "failure">("idle");
  const abortRef = useRef<AbortController | null>(null);

  const isChecking = state === "checking";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!text.trim() || isChecking) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setState("checking");
    setErrorMessage(null);
    setResult(null);
    setCopyStatus("idle");

    try {
      const response = await fetch("/api/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, locale }),
        signal: controller.signal,
        cache: "no-store",
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setErrorMessage(t[mapErrorToKey(body.error)]);
        setState("error");
        return;
      }

      const data = (await response.json()) as CheckResponse;
      setResult(data);
      setState("done");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setState("idle");
        return;
      }
      setErrorMessage(t.errorGeneric);
      setState("error");
    }
  }

  function handleCancel() {
    abortRef.current?.abort();
  }

  async function handleCopySummary() {
    if (!result) return;
    const summaryText = [
      formatCount(t.summaryVerified, result.summary.verified),
      formatCount(t.summaryNeedsReview, result.summary.needs_review),
      formatCount(t.summaryDisputed, result.summary.disputed),
      formatCount(t.summaryNotFound, result.summary.not_found),
    ].join(" · ");

    try {
      await navigator.clipboard.writeText(summaryText);
      setCopyStatus("success");
    } catch {
      setCopyStatus("failure");
    }
  }

  const noMatchReasonText: Record<string, string> = {
    no_candidates: t.noMatchNoCandidates,
    below_threshold: t.noMatchBelowThreshold,
    negation_mismatch: t.noMatchNegationMismatch,
    quantity_mismatch: t.noMatchQuantityMismatch,
    polarity_mismatch: t.noMatchPolarityMismatch,
  };

  return (
    <section className="registry-panel" aria-labelledby="check-form-heading">
      <h2 id="check-form-heading">{t.inputLabel}</h2>
      <form onSubmit={handleSubmit}>
        <label htmlFor="check-input" style={{ display: "block", marginBottom: 4 }}>
          {t.inputLabel}
        </label>
        <textarea
          id="check-input"
          name="text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={t.inputPlaceholder}
          disabled={isChecking}
          rows={6}
          maxLength={5000}
          style={{ width: "100%", boxSizing: "border-box" }}
        />
        <p style={{ fontSize: 13, color: "var(--muted, #6b7280)" }}>{t.privacyNote}</p>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button type="submit" className="btn btn-primary" disabled={isChecking || !text.trim()}>
            {isChecking ? t.submitting : t.submit}
          </button>
          {isChecking ? (
            <button type="button" className="button button-secondary" onClick={handleCancel}>
              {t.cancel}
            </button>
          ) : null}
          <span aria-live="polite" aria-busy={isChecking}>
            {isChecking ? t.statusChecking : state === "done" ? t.statusDone : t.statusIdle}
          </span>
        </div>
      </form>

      {errorMessage ? (
        <p role="alert" style={{ color: "var(--danger, #b91c1c)" }}>
          {errorMessage}
        </p>
      ) : null}

      {result ? (
        <section aria-live="polite" style={{ marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <h2 style={{ margin: 0 }}>{t.resultsHeading}</h2>
            <button type="button" className="button button-secondary" onClick={handleCopySummary}>
              {copyStatus === "success" ? t.copySuccess : copyStatus === "failure" ? t.copyFailure : t.copySummary}
            </button>
          </div>
          <p>
            {formatCount(t.summaryVerified, result.summary.verified)} {"·"} {formatCount(t.summaryNeedsReview, result.summary.needs_review)} {"·"}{" "}
            {formatCount(t.summaryDisputed, result.summary.disputed)} {"·"} {formatCount(t.summaryNotFound, result.summary.not_found)}
          </p>
          <ul style={{ listStyle: "none", padding: 0 }}>
            {result.sentences.map((item, index) => {
              const presentation = item.match ? presentationForUnknown(item.match.status) : null;
              return (
                <li key={index} className="registry-panel" style={{ marginTop: 8 }}>
                  <p>{item.sentence}</p>
                  {item.match && presentation ? (
                    <>
                      <p>
                        <span style={{ color: presentation.color }}>{tCitation[presentation.labelKey]}</span>
                      </p>
                      <p style={{ fontSize: 13 }}>{item.match.claim_text}</p>
                      <Link href={`/${locale}/wiki/${item.match.document_slug}`}>{t.viewSource}</Link>
                    </>
                  ) : (
                    <p style={{ color: "var(--muted, #6b7280)" }}>
                      {item.no_match_reason ? noMatchReasonText[item.no_match_reason] : t.noMatchNoCandidates}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </section>
  );
}
