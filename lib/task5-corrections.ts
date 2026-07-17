import type { ClaimPublicationState } from "./types";

export const REPORT_BODY_MAX_BYTES = 16 * 1024;
export const REPORT_CONTACT_MAX_LENGTH = 254;

export const REPORT_ISSUE_CATEGORIES = [
  "incorrect",
  "outdated",
  "unsupported",
  "harmful",
  "privacy",
  "legal",
  "right_of_reply",
  "other",
] as const;

export type ReportIssueCategory = (typeof REPORT_ISSUE_CATEGORIES)[number];
export type ReportSeverity = "low" | "medium" | "high" | "critical";

export function isReportIssueCategory(value: unknown): value is ReportIssueCategory {
  return REPORT_ISSUE_CATEGORIES.includes(value as ReportIssueCategory);
}

export function severityForReportCategory(category: ReportIssueCategory): ReportSeverity {
  if (category === "harmful") return "critical";
  if (category === "privacy" || category === "legal" || category === "right_of_reply") return "high";
  if (category === "incorrect" || category === "outdated" || category === "unsupported") return "medium";
  return "low";
}

export function publicationStateBlocksCitation(state: ClaimPublicationState | undefined): boolean {
  return state === "quarantined" || state === "withdrawn";
}
