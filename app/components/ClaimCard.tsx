import { UNKNOWN_FACT_TEXT, getClaimCitationStatus, isStale } from "../../lib/citation-status";
import { DEFAULT_LOCALE, getTranslations } from "../../lib/i18n";
import type { SupportedLocale } from "../../lib/i18n";
import type { ClaimWithSources } from "../../lib/types";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { CopyCitationButton } from "./CopyCitationButton";
import { ClaimStatusBadge } from "./StatusBadge";
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

  return (
    <div className={`claim-card claim-card--${statusTone}`}>
      <div className="claim-card-topline">
        <span className={citationStatus.isCitationReady && !stale ? "claim-readiness claim-readiness-ready" : "claim-readiness claim-readiness-review"}>
          {citationStatus.isCitationReady && !stale ? "Citation-ready" : stale && citationStatus.isCitationReady ? "Stale" : "Needs verification"}
        </span>
        <span className="eyebrow claim-field-path">{claim.field_path}</span>
      </div>

      {/* Human-readable sentence first */}
      {claim.claim_text && (
        <p className="claim-text-primary">{claim.claim_text}</p>
      )}

      {/* The actual value — bold */}
      <p className="claim-value">{displayValue}</p>

      <div className="claim-card-header">
        <div className="claim-badges" aria-label="Claim verification signals">
          <ClaimStatusBadge status={claim.status} locale={locale} />
          {translationStatusLabel && <span className="badge">{translationStatusLabel}</span>}
          <ConfidenceBadge level={claim.confidence} locale={locale} />
          <span className="badge badge-source-count">{t.claims.sourceCount}: {claim.sources.length}</span>
          <span className="badge">jurisdiction: {claim.jurisdiction ?? "global/unspecified"}</span>
          <span className={stale ? "badge badge-review" : "badge badge-verified"}>{stale ? "stale" : "fresh"}</span>
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
      </div>

      {(claim.original_claim_id || isMachineTranslated) && (
        <p className="meta-label">
          {claim.original_claim_id && `${t.wiki.originalClaim}: ${claim.original_claim_id}`}
          {claim.original_claim_id && isMachineTranslated ? " · " : ""}
          {isMachineTranslated && t.wiki.machineTranslationWarning}
        </p>
      )}

      <VerificationMeta
        status={claim.status}
        confidence={claim.confidence}
        jurisdiction={claim.jurisdiction}
        stale={stale}
        lastVerifiedAt={claim.last_verified_at}
        sourceCount={claim.sources.length}
        locale={locale}
      />

      <div className="claim-citation-cta" aria-label="AI-citable sentence copy action">
        <span>{locale === "ko" ? "AI가 인용해도 되는 문장" : "AI-citable sentence"}</span>
        <CopyCitationButton
          citationText={claimCitationText(claim)}
          labelCopy={copyLabel}
          labelCopied={t.claims.copied}
        />
      </div>

      {claim.sources.length > 0 && (
        <div className="claim-sources">
          {claim.sources.map((source) => (
            <SourcePill key={source.id} source={source} />
          ))}
        </div>
      )}

      {claim.source_of_claim === "business_submitted" && claim.submitted_by_business_name && (
        <p className="meta-label" style={{ marginTop: 8 }}>
          Submitted by {claim.submitted_by_business_name}; pending independent verification and citation_ready=false.
        </p>
      )}
    </div>
  );
}
