import type { ClaimWithSources } from "../../lib/types";
import { UNKNOWN_FACT_TEXT } from "../../lib/citation-status";
import { getTranslations } from "../../lib/i18n";
import type { SupportedLocale } from "../../lib/i18n";
import { DEFAULT_LOCALE } from "../../lib/i18n/locales";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { ClaimStatusBadge } from "./StatusBadge";
import { SourcePill } from "./SourcePill";
import { VerificationMeta } from "./VerificationMeta";

export function ClaimCard({ claim, locale }: { claim: ClaimWithSources; locale?: string }) {
  const t = getTranslations((locale ?? DEFAULT_LOCALE) as SupportedLocale);
  // The canonical unknown sentinel ("확인 필요") is shown to humans in their own
  // language; machine surfaces (JSON/JSON-LD/llms.txt) keep the canonical value.
  const displayValue = claim.claim_value === UNKNOWN_FACT_TEXT ? t.claims.needsReview : claim.claim_value;
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
        <span className="eyebrow" style={{ fontSize: "0.75rem", opacity: 0.55 }}>
          {claim.field_path}
        </span>
        <div className="claim-badges">
          <ConfidenceBadge level={claim.confidence} locale={locale} />
          <ClaimStatusBadge status={claim.status} locale={locale} />
        </div>
      </div>

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
