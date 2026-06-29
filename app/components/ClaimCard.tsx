import { UNKNOWN_FACT_TEXT } from "../../lib/citation-status";
import { DEFAULT_LOCALE, getTranslations } from "../../lib/i18n";
import type { SupportedLocale } from "../../lib/i18n";
import type { ClaimWithSources } from "../../lib/types";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { ClaimStatusBadge } from "./StatusBadge";
import { SourcePill } from "./SourcePill";
import { VerificationMeta } from "./VerificationMeta";

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

  return (
    <div className="claim-card">
      {/* Human-readable sentence first */}
      {claim.claim_text && (
        <p className="claim-text-primary">{claim.claim_text}</p>
      )}

      {/* The actual value — bold */}
      <p className="claim-value">{displayValue}</p>

      {/* Technical label + badges — de-emphasized */}
      <div className="claim-card-header">
        <span className="eyebrow claim-field-path">
          {claim.field_path}
        </span>
        <div className="claim-badges">
          <ConfidenceBadge level={claim.confidence} locale={locale} />
          <ClaimStatusBadge status={claim.status} locale={locale} />
          {translationStatusLabel && <span className="badge">{translationStatusLabel}</span>}
          {claim.jurisdiction && <span className="badge">{claim.jurisdiction}</span>}
        </div>
      </div>

      {(claim.original_claim_id || isMachineTranslated) && (
        <p className="meta-label">
          {claim.original_claim_id && `${t.wiki.originalClaim}: ${claim.original_claim_id}`}
          {claim.original_claim_id && isMachineTranslated ? " · " : ""}
          {isMachineTranslated && t.wiki.machineTranslationWarning}
        </p>
      )}

      {claim.sources.length > 0 && (
        <div className="claim-sources">
          {claim.sources.map((source) => (
            <SourcePill key={source.id} source={source} />
          ))}
        </div>
      )}

      <VerificationMeta
        lastVerifiedAt={claim.last_verified_at}
        sourceCount={claim.sources.length}
        locale={locale}
      />
    </div>
  );
}
