import type { ClaimWithSources } from "../../lib/types";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { ClaimStatusBadge } from "./StatusBadge";
import { SourcePill } from "./SourcePill";
import { VerificationMeta } from "./VerificationMeta";

export function ClaimCard({ claim }: { claim: ClaimWithSources }) {
  return (
    <div className="claim-card">
      {/* Human-readable sentence first */}
      {claim.claim_text && (
        <p className="claim-text-primary">{claim.claim_text}</p>
      )}

      {/* The actual value — bold */}
      <p className="claim-value">{claim.claim_value}</p>

      {/* Technical label + badges — de-emphasized */}
      <div className="claim-card-header">
        <span className="eyebrow" style={{ fontSize: "0.75rem", opacity: 0.55 }}>
          {claim.field_path}
        </span>
        <div className="claim-badges">
          <ConfidenceBadge level={claim.confidence} />
          <ClaimStatusBadge status={claim.status} />
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
      />
    </div>
  );
}
