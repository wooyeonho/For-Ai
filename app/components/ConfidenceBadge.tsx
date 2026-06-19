import type { Confidence } from "../../lib/types";

const CONFIDENCE_STYLES: Record<Confidence, string> = {
  low: "badge badge-low",
  medium: "badge badge-medium",
  high: "badge badge-high",
};

const CONFIDENCE_LABELS: Record<Confidence, string> = {
  low: "낮음",
  medium: "보통",
  high: "높음",
};

export function ConfidenceBadge({ level }: { level: Confidence }) {
  return (
    <span className={CONFIDENCE_STYLES[level]}>
      신뢰도: {CONFIDENCE_LABELS[level]}
    </span>
  );
}
