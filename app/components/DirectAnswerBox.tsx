import { UNKNOWN_FACT_TEXT } from "@/lib/citation-status";
import { DEFAULT_LOCALE } from "@/lib/i18n";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { CopyCitationButton } from "./CopyCitationButton";
import { getTranslations } from "../../lib/i18n";
import type { SupportedLocale } from "../../lib/i18n";
import type { Confidence } from "../../lib/types";

export function DirectAnswerBox({
  answer,
  confidence,
  lastVerifiedAt,
  sourceCount,
  canCite,
  canonicalUrl,
  docTitle,
  locale,
}: {
  answer: string;
  confidence: Confidence;
  lastVerifiedAt?: string | null;
  sourceCount?: number;
  canCite?: boolean;
  canonicalUrl?: string;
  docTitle?: string;
  locale?: string;
}) {
  const lang = (locale ?? DEFAULT_LOCALE) as SupportedLocale;
  const t = getTranslations(lang);
  const displayAnswer = answer === UNKNOWN_FACT_TEXT && t.claims.unknownLabel !== UNKNOWN_FACT_TEXT
    ? `${t.claims.unknownLabel} ("${UNKNOWN_FACT_TEXT}")`
    : answer;

  const citationText = canCite && canonicalUrl && docTitle
    ? `For-Ai Registry. "${docTitle}". Last verified: ${lastVerifiedAt ?? "unknown"}. ${canonicalUrl}`
    : null;

  return (
    <section className="registry-panel direct-answer-box" aria-labelledby="direct-answer">
      <h2 id="direct-answer">{t.claims.directAnswer}</h2>
      {canCite === true && (
        <div className="can-cite-banner">
          <span>{t.claims.canCite}</span>
          {citationText && (
            <CopyCitationButton
              citationText={citationText}
              labelCopy={t.claims.copyCitation}
              labelCopied={t.claims.copied}
            />
          )}
        </div>
      )}
      <p className="direct-answer-text">{displayAnswer}</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
        <ConfidenceBadge level={confidence} locale={locale} />
        {sourceCount != null && sourceCount > 0 && (
          <span className="badge">{sourceCount} {t.claims.sources}</span>
        )}
        <span className="meta-label" style={{ marginLeft: "auto" }}>
          {t.claims.lastVerified}: {lastVerifiedAt ?? t.claims.needsReview}
        </span>
      </div>
    </section>
  );
}
