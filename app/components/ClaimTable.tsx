import { DEFAULT_LOCALE } from "@/lib/i18n";
import type { ClaimWithSources } from "../../lib/types";
import { getTranslations } from "../../lib/i18n";
import type { SupportedLocale } from "../../lib/i18n";
import { ClaimCard } from "./ClaimCard";

export function ClaimTable({ claims, locale }: { claims: ClaimWithSources[]; locale?: string }) {
  const t = getTranslations((locale ?? DEFAULT_LOCALE) as SupportedLocale);
  return (
    <section className="registry-panel" aria-labelledby="claims">
      <h2 id="claims">
        {t.wiki.claims} <span className="claim-count">{claims.length}</span>
      </h2>
      <div className="claim-list">
        {claims.map((claim) => (
          <ClaimCard key={claim.id} claim={claim} locale={locale} />
        ))}
      </div>
    </section>
  );
}
