import type { ClaimWithSources } from "../../lib/types";
import { ClaimCard } from "./ClaimCard";

export function ClaimTable({ claims }: { claims: ClaimWithSources[] }) {
  return (
    <section className="registry-panel" aria-labelledby="claims">
      <h2 id="claims">
        Claims <span className="claim-count">{claims.length}</span>
      </h2>
      <div className="claim-list">
        {claims.map((claim) => (
          <ClaimCard key={claim.id} claim={claim} />
        ))}
      </div>
    </section>
  );
}
