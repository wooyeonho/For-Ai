import { getTranslations } from "../../lib/i18n";
import type { SupportedLocale } from "../../lib/i18n";

export function VerificationMeta({
  lastVerifiedAt,
  sourceCount,
  locale,
}: {
  lastVerifiedAt: string | null;
  sourceCount: number;
  locale?: string;
}) {
  const t = getTranslations((locale ?? "ko") as SupportedLocale);
  return (
    <div className="verification-meta">
      <span className="meta-label">{t.claims.verificationDate}</span>
      <span className="verification-value">
        {lastVerifiedAt ?? t.claims.needsReview}
      </span>
      <span className="meta-label">{t.claims.sourceCount}</span>
      <span className="verification-value">{sourceCount}</span>
    </div>
  );
}
