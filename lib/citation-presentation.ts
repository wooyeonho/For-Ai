import type { ClaimStatus } from "./types";

// Reuse the schema's ClaimStatus rather than introducing a parallel status
// enum for citation surfaces.
export type CitationStatus = ClaimStatus;
export type CitationStatusLabelKey =
  | "citationStatusVerified"
  | "citationStatusNeedsReview"
  | "citationStatusDisputed"
  | "citationStatusUnknownValue"
  | "citationStatusUnavailable";

export type CitationPresentation = {
  machineLabel: string;
  labelKey: CitationStatusLabelKey;
  color: string;
};

const SCHEMA_PRESENTATION = {
  verified: { machineLabel: "Verified", labelKey: "citationStatusVerified", color: "var(--success, #2e7d32)" },
  needs_review: { machineLabel: "Needs review", labelKey: "citationStatusNeedsReview", color: "var(--warning, #b45309)" },
  disputed: { machineLabel: "Disputed", labelKey: "citationStatusDisputed", color: "var(--danger, #b91c1c)" },
  unknown: { machineLabel: "Unknown", labelKey: "citationStatusUnknownValue", color: "var(--muted, #6b7280)" },
} satisfies Record<CitationStatus, CitationPresentation>;

export type PresentationKey = keyof typeof SCHEMA_PRESENTATION | "unavailable";

const UNAVAILABLE_PRESENTATION: CitationPresentation = {
  machineLabel: "Unavailable",
  labelKey: "citationStatusUnavailable",
  color: "var(--muted, #6b7280)",
};

export function presentationForStatus(status: CitationStatus): CitationPresentation {
  return SCHEMA_PRESENTATION[status];
}

export function presentationForUnknown(status: string | null | undefined): CitationPresentation {
  if (status && status in SCHEMA_PRESENTATION) {
    return SCHEMA_PRESENTATION[status as CitationStatus];
  }
  return UNAVAILABLE_PRESENTATION;
}

export function presentationForKey(key: PresentationKey): CitationPresentation {
  if (key === "unavailable") return UNAVAILABLE_PRESENTATION;
  return SCHEMA_PRESENTATION[key];
}
