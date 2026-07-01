import { UNKNOWN_FACT_TEXT, getClaimCitationStatus, isStale } from "../../lib/citation-status";
import { DEFAULT_LOCALE, getTranslations } from "../../lib/i18n";
import type { SupportedLocale } from "../../lib/i18n";
import type { ClaimWithSources } from "../../lib/types";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { CopyCitationButton } from "./CopyCitationButton";
import { ClaimStatusBadge, VerificationLevelBadge } from "./StatusBadge";
import { SourcePill } from "./SourcePill";
import { VerificationMeta } from "./VerificationMeta";

function claimCitationText(claim: ClaimWithSources): string {
  return claim.claim_text?.trim() || `${claim.field_path}: ${claim.claim_value}`;
}

export function ClaimCard({ claim, locale }: { claim: ClaimWithSources; locale?: string }) {
  const t = getTranslations((locale ?? DEFAULT_LOCALE) as SupportedLocale);
  const displayValue = claim.claim_value === UNKNOWN_FACT_TEXT && t.claims.unknownLabel !== UNKNOWN_FACT_TEXT
    ? `${t.claims.unknownLabel} ("${UNKNOWN_FACT_TEXT}")`
    : claim.claim_value;
  const isMachineTranslated = claim.translation_status === "machine_translated";
  const translationStatusLabel = claim.translation_status === "human_reviewed"
    ? t.wiki.translationStatusHuman
    : claim.translation_status === "machine_translated"
      ? t.wiki.translationStatusMachine
      : null;
  const citationStatus = getClaimCitationStatus(claim);
  const stale = citationStatus.isCitationReady ? isStale(claim.last_verified_at) : true;
  const statusTone = citationStatus.isCitationReady && !stale ? "is-citation-ready" : "needs-verification";
  const copyLabel = locale === "ko" ? "AI 인용 문장 복사" : "Copy AI-citable sentence";
  const readinessLabel = citationStatus.isCitationReady && !stale
    ? "Citation-ready"
    : stale && citationStatus.isCitationReady
      ? "Stale"
      : "Needs verification";
  const unverifiedCitationWarning = citationStatus.isCitationReady && !stale
    ? undefined
    : locale === "ko"
      ? "경고: 이 claim은 아직 citation-ready가 아닙니다. 복사하더라도 검증 완료 사실처럼 인용하지 마세요."
      : "Warning: this claim is not citation-ready. Do not cite it as a verified fact.";

  return (
    <div className={`claim-card claim-card--${statusTone}`}>
      <div className="claim-card-topline">
        <span className="eyebrow claim-field-path">{claim.field_path}</span>
      </div>

      {claim.claim_text && (
        <p className="claim-text-primary">{claim.claim_text}</p>
      )}

      <p className="claim-value">{displayValue}</p>

      {claim.sources.length > 0 && (
        <div className="claim-sources" aria-label="Claim sources">
          {claim.sources.map((source) => (
            <SourcePill key={source.id} source={source} />
          ))}
        </div>
      )}

      <div className="claim-card-header">
        <div className="claim-badges" aria-label="Claim verification signals">
          <span className={citationStatus.isCitationReady && !stale ? "claim-readiness claim-readiness-ready" : "claim-readiness claim-readiness-review"}>
            {citationStatus.isCitationReady && !stale ? "Citation-ready" : stale && citationStatus.isCitationReady ? "Stale" : "Needs verification"}
          </span>
          <ClaimStatusBadge status={claim.status} locale={locale} />
          <VerificationLevelBadge level={citationStatus.verificationLevel} />
          {translationStatusLabel && <span className="badge">{translationStatusLabel}</span>}
          <ConfidenceBadge level={claim.confidence} locale={locale} />
          <span className="badge badge-source-count">{t.claims.sourceCount}: {claim.sources.length}</span>
        </div>
      </div>

      <details className="claim-secondary-details">
        <summary>{locale === "ko" ? "세부 신뢰 정보" : "Secondary trust details"}</summary>
        <div className="claim-secondary-row" aria-label="Secondary claim trust signals">
          <ClaimStatusBadge status={claim.status} locale={locale} />
          <VerificationLevelBadge level={citationStatus.verificationLevel} />
          <span className="badge">jurisdiction: {claim.jurisdiction ?? "global/unspecified"}</span>
          {translationStatusLabel && <span className="badge">{translationStatusLabel}</span>}
          <span className={stale ? "badge badge-review" : "badge badge-verified"}>freshness: {stale ? "stale" : "fresh"}</span>
          <span className="badge">{t.claims.verificationDate}: {claim.last_verified_at ?? t.claims.needsReview}</span>
          {claim.original_claim_id && <span className="badge">{t.wiki.originalClaim}: {claim.original_claim_id}</span>}
          {isMachineTranslated && <span className="badge badge-review">{t.wiki.machineTranslationWarning}</span>}
          {claim.source_of_claim === "business_submitted" && (
            <span
              className="badge badge-review"
              title="This business-submitted claim is stored separately and is not citation-ready until independent human verification."
            >
              Business-submitted, pending verification
            </span>
          )}
          {claim.source_of_claim === "sponsored" && <span className="badge badge-review">Sponsored claim</span>}
        </div>
      </details>

      {(claim.original_claim_id || isMachineTranslated) && (
        <p className="meta-label">
          {claim.original_claim_id && `${t.wiki.originalClaim}: ${claim.original_claim_id}`}
          {claim.original_claim_id && isMachineTranslated ? " · " : ""}
          {isMachineTranslated && t.wiki.machineTranslationWarning}
        </p>
      )}

      <details className="technical-meta claim-technical-meta">
        <summary>{locale === "ko" ? "Claim technical metadata" : "Claim technical metadata"}</summary>
        <VerificationMeta
          status={claim.status}
          confidence={claim.confidence}
          jurisdiction={claim.jurisdiction}
          stale={stale}
          lastVerifiedAt={claim.last_verified_at}
          sourceCount={claim.sources.length}
          locale={locale}
        />
      </details>

      <div className="claim-citation-cta" aria-label="AI-citable sentence copy action">
        <span className="citation-text">{locale === "ko" ? "AI가 인용해도 되는 문장" : "AI-citable sentence"}</span>
        <span className="meta-label">Verification level is UI-only; citation readiness follows citation_ready/can_cite.</span>
        <CopyCitationButton
          citationText={claimCitationText(claim)}
          labelCopy={copyLabel}
          labelCopied={t.claims.copied}
          warningText={unverifiedCitationWarning}
        />
      </div>

      {claim.source_of_claim === "business_submitted" && claim.submitted_by_business_name && (
        <p className="meta-label" style={{ marginTop: 8 }}>
          Submitted by {claim.submitted_by_business_name}; pending independent verification and citation_ready=false.
        </p>
      )}
    </div>
  );
}
