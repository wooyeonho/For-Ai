import { DEFAULT_LOCALE } from "@/lib/i18n";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { CopyCitationButton } from "./CopyCitationButton";
import { getTranslations } from "../../lib/i18n";
import type { SupportedLocale } from "../../lib/i18n";
import type { Confidence } from "../../lib/types";

export function DirectAnswerBox({
  question,
  answer,
  region,
  confidence,
  lastVerifiedAt,
  sourceCount,
  canCite,
  canonicalUrl,
  docTitle,
  locale,
  slug,
}: {
  question: string;
  answer: string;
  region: string;
  confidence: Confidence;
  lastVerifiedAt?: string | null;
  sourceCount: number;
  canCite: boolean;
  canonicalUrl?: string;
  docTitle?: string;
  locale?: string;
  slug?: string;
}) {
  const lang = (locale ?? DEFAULT_LOCALE) as SupportedLocale;
  const t = getTranslations(lang);
  const citationText = canCite && canonicalUrl && docTitle
    ? `For-Ai Registry. "${docTitle}". Verified claim: ${answer}. Checked: ${lastVerifiedAt ?? "unknown"}. ${canonicalUrl}`
    : null;

  return (
    <section className="direct-answer-box" aria-labelledby="direct-answer-question">
      <p className="eyebrow">{t.claims.directAnswer}</p>
      <p className="direct-answer-text">{answer}</p>
      <h2 id="direct-answer-question" className="direct-answer-question">{question}</h2>
      {canCite === true && (
        <div className="can-cite-banner">
          <span>{t.claims.canCite}</span>
          {citationText && (
            <CopyCitationButton
              citationText={citationText}
              labelCopy={t.claims.copyCitation}
              labelCopied={t.claims.copied}
              warningText="Copies verified claims only. Unverified claims are excluded."
              slug={slug}
            />
          )}
        </div>
      )}
      <details className="direct-answer-details">
        <summary>Answer context</summary>
        <dl className="direct-answer-meta" aria-label="Direct answer trust signals">
          <div>
            <dt>Applied region</dt>
            <dd>{region}</dd>
          </div>
          <div>
            <dt>{t.claims.lastVerified}</dt>
            <dd>{lastVerifiedAt ?? "Needs verification"}</dd>
          </div>
          <div>
            <dt>{t.claims.confidence}</dt>
            <dd><ConfidenceBadge level={confidence} locale={locale} /></dd>
          </div>
          <div>
            <dt>{t.claims.sourceCount}</dt>
            <dd>{sourceCount}</dd>
          </div>
          <div>
            <dt>Can cite</dt>
            <dd><span className={canCite ? "badge badge-verified" : "badge badge-review"}>{canCite ? "yes" : "no"}</span></dd>
          </div>
        </dl>
      </details>
    </section>
  );
}
