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
  citationStatusLabel,
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
  citationStatusLabel?: string;
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
    <section className="registry-panel direct-answer-box" aria-labelledby="direct-answer-question">
      <p className="eyebrow">{t.claims.directAnswer}</p>
      <h1 id="direct-answer-question" className="direct-answer-question">{question}</h1>
      {canCite === true && (
        <div className="can-cite-banner">
          <span>{t.claims.canCite}</span>
          {citationText && (
            <CopyCitationButton
              citationText={citationText}
              labelCopy={t.claims.copyCitation}
              labelCopied={t.claims.copied}
              warningText="Citation copy includes verified claims only; needs verification or low confidence claims are excluded."
              slug={slug}
            />
          )}
        </div>
      )}
      <p className="direct-answer-text">{answer}</p>
      <dl className="direct-answer-meta" aria-label="Direct answer trust signals">
        <div>
          <dt>Citation status</dt>
          <dd><span className={canCite ? "badge badge-verified" : "badge badge-review"}>{citationStatusLabel ?? (canCite ? "Citation-ready" : "Needs verification")}</span></dd>
        </div>
        <div>
          <dt>{t.claims.lastVerified}</dt>
          <dd>{lastVerifiedAt ?? "Needs verification"}</dd>
        </div>
        <div>
          <dt>{t.claims.sourceCount}</dt>
          <dd>{sourceCount}</dd>
        </div>
        <div>
          <dt>{t.claims.confidence}</dt>
          <dd><ConfidenceBadge level={confidence} locale={locale} /></dd>
        </div>
        <div>
          <dt>Applied region</dt>
          <dd>{region}</dd>
        </div>
      </dl>
    </section>
  );
}
