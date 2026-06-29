import { DEFAULT_LOCALE } from "@/lib/i18n";
import { getTranslations } from "../../lib/i18n";
import type { SupportedLocale } from "../../lib/i18n";
import type { ClaimStatus, Confidence } from "../../lib/types";

export function VerificationMeta({
  lastVerifiedAt,
  sourceCount,
  status,
  confidence,
  jurisdiction,
  stale,
  locale,
}: {
  lastVerifiedAt: string | null;
  sourceCount: number;
  status: ClaimStatus;
  confidence: Confidence;
  jurisdiction: string | null;
  stale: boolean;
  locale?: string;
}) {
  const t = getTranslations((locale ?? DEFAULT_LOCALE) as SupportedLocale);
  return (
    <dl className="verification-meta" aria-label="Verification metadata">
      <div><dt className="meta-label">verification status</dt><dd className="verification-value">{status}</dd></div>
      <div><dt className="meta-label">{t.claims.confidence}</dt><dd className="verification-value">{confidence}</dd></div>
      <div><dt className="meta-label">{t.claims.sourceCount}</dt><dd className="verification-value">{sourceCount}</dd></div>
      <div><dt className="meta-label">{t.claims.verificationDate}</dt><dd className="verification-value">{lastVerifiedAt ?? t.claims.needsReview}</dd></div>
      <div><dt className="meta-label">jurisdiction</dt><dd className="verification-value">{jurisdiction ?? "global/unspecified"}</dd></div>
      <div><dt className="meta-label">stale</dt><dd className="verification-value">{stale ? "yes" : "no"}</dd></div>
    </dl>
  );
}
