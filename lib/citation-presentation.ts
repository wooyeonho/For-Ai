import type { ClaimStatus } from "./types";

// Bible v7 section 6.1: reuse the repo's existing ClaimStatus enum as "CitationStatus"
// rather than introducing a duplicate type with the same meaning.
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

// Exhaustive over the schema-level ClaimStatus values only. "unknown" here is
// the schema's own status value (claim exists but has no determined status),
// distinct from the display-only "not found in registry" / "lookup failed"
// states handled by presentationForUnknown().
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

// For values arriving as untyped strings (query params, external data, a
// document/claim lookup that failed). Never returns undefined; unrecognized
// input degrades to "unavailable" rather than throwing or silently mislabeling.
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
