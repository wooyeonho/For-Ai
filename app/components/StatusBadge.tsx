import { DEFAULT_LOCALE } from "@/lib/i18n";
import { getTranslations } from "../../lib/i18n";
import type { SupportedLocale } from "../../lib/i18n";
import type { VerificationLevelInfo } from "../../lib/citation-status";
import type { ClaimStatus, DocumentStatus } from "../../lib/types";

function statusClass(status: string): string {
  const normalized = status.replace(/_/g, "-");
  if (status === "verified" || status === "published") return `status-badge status-badge--${normalized}`;
  if (status === "needs_review") return "status-badge status-badge--needs-review";
  if (status === "disputed") return "status-badge status-badge--danger";
  if (status === "ai_draft") return "status-badge status-badge--ai-draft";
  return `status-badge status-badge--${normalized}`;
}

export function ClaimStatusBadge({ status, locale }: { status: ClaimStatus; locale?: string }) {
  const t = getTranslations((locale ?? DEFAULT_LOCALE) as SupportedLocale);
  const labels: Record<ClaimStatus, string> = {
    needs_review: t.claims.needsReview,
    verified:     t.claims.verified,
    disputed:     t.claims.disputed,
    unknown:      t.claims.statusUnknown,
  };
  return <span className={statusClass(status)} title={`verification status: ${status}`}>{labels[status]}</span>;
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
  return <span className={statusClass(status)} title={`verification status: ${status}`}>{labels[status]}</span>;
}


export function VerificationLevelBadge({ level }: { level: VerificationLevelInfo }) {
  const tone = level.level >= 3 ? "status-badge status-badge--verified" : level.level >= 1 ? "status-badge status-badge--needs-review" : "status-badge status-badge--draft";
  return (
    <span className={tone} title={`${level.label}: ${level.description}. UI explanation only; citation readiness still follows citation_ready/can_cite policy.`}>
      {level.label}: {level.description}
    </span>
  );
}
