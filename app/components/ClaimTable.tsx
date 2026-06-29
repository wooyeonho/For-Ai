import { DEFAULT_LOCALE } from "@/lib/i18n";
import { getClaimCitationStatus, isStale } from "../../lib/citation-status";
import type { ClaimWithSources } from "../../lib/types";
import { getTranslations } from "../../lib/i18n";
import type { SupportedLocale } from "../../lib/i18n";
import { ClaimCard } from "./ClaimCard";

export function ClaimTable({ claims, locale }: { claims: ClaimWithSources[]; locale?: string }) {
  const t = getTranslations((locale ?? DEFAULT_LOCALE) as SupportedLocale);
  const readyClaims = claims.filter((claim) => {
    const status = getClaimCitationStatus(claim);
    return status.isCitationReady && !isStale(claim.last_verified_at);
  }).length;
  const staleClaims = claims.filter((claim) => getClaimCitationStatus(claim).isCitationReady && isStale(claim.last_verified_at)).length;
  const documentCitationLabel = staleClaims > 0
    ? "Stale"
    : readyClaims === claims.length && claims.length > 0
      ? "Citation-ready"
      : readyClaims > 0
        ? "Mixed"
        : "Needs verification";
  const documentCitationClass = documentCitationLabel === "Citation-ready"
    ? "document-citation-status document-citation-status--ready"
    : documentCitationLabel === "Stale"
      ? "document-citation-status document-citation-status--stale"
      : documentCitationLabel === "Mixed"
        ? "document-citation-status document-citation-status--mixed"
        : "document-citation-status document-citation-status--review";
  return (
    <section className="registry-panel" aria-labelledby="claims">
      <div className="claims-heading-row">
        <h2 id="claims">
          {t.wiki.claims} <span className="claim-count">{claims.length}</span>
        </h2>
        <div className={documentCitationClass} aria-label="Document citation status">
          <strong>{documentCitationLabel}</strong>
          <span>{readyClaims}/{claims.length} citation-ready · {staleClaims} stale</span>
        </div>
      </div>
      <div className="claim-list">
        {claims.map((claim) => (
          <ClaimCard key={claim.id} claim={claim} locale={locale} />
        ))}
      </div>
    </section>
  );
}
