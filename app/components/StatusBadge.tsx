import { DEFAULT_LOCALE } from "@/lib/i18n";
import { getTranslations } from "../../lib/i18n";
import type { SupportedLocale } from "../../lib/i18n";
import type { ClaimStatus, DocumentStatus } from "../../lib/types";

function statusClass(status: string): string {
  if (status === "verified" || status === "published") return "badge badge-verified";
  if (status === "disputed") return "badge badge-disputed";
  return "badge badge-review";
}

export function ClaimStatusBadge({ status, locale }: { status: ClaimStatus; locale?: string }) {
  const t = getTranslations((locale ?? DEFAULT_LOCALE) as SupportedLocale);
  const labels: Record<ClaimStatus, string> = {
    needs_review: t.claims.needsReview,
    verified:     t.claims.verified,
    disputed:     t.claims.disputed,
    unknown:      t.claims.statusUnknown,
  };
  return <span className={statusClass(status)}>{labels[status]}</span>;
}

export function DocumentStatusBadge({ status, locale }: { status: DocumentStatus; locale?: string }) {
  const t = getTranslations((locale ?? DEFAULT_LOCALE) as SupportedLocale);
  const labels: Record<DocumentStatus, string> = {
    ai_draft:     t.claims.statusAiDraft,
    needs_review: t.claims.needsReview,
    verified:     t.claims.verified,
    published:    t.claims.statusPublished,
    archived:     t.claims.statusArchived,
  };
  return <span className={statusClass(status)}>{labels[status]}</span>;
}
