import { DEFAULT_LOCALE } from "@/lib/i18n";
import { getTranslations } from "../../lib/i18n";
import type { SupportedLocale } from "../../lib/i18n";
import type { Confidence } from "../../lib/types";

const CONFIDENCE_STYLES: Record<Confidence, string> = {
  low: "badge badge-low",
  medium: "badge badge-medium",
  high: "badge badge-high",
};

export function ConfidenceBadge({ level, locale }: { level: Confidence; locale?: string }) {
  const t = getTranslations((locale ?? DEFAULT_LOCALE) as SupportedLocale);
  const labels: Record<Confidence, string> = {
    low: t.claims.confidenceLow,
    medium: t.claims.confidenceMedium,
    high: t.claims.confidenceHigh,
  };
  return (
    <span className={CONFIDENCE_STYLES[level]} title={`confidence: ${level}`}>
      {t.claims.confidence}: {labels[level]}
    </span>
  );
}
