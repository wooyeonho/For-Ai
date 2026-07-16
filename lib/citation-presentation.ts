import type { ClaimStatus, Confidence } from "./types";

export type CitationPresentation = {
  label: string;
  tone: "verified" | "needs_review" | "disputed" | "unknown";
  citeable: boolean;
};

export function getCitationPresentation(status: ClaimStatus, confidence: Confidence): CitationPresentation {
  if (status === "verified" && confidence === "high") return { label: "Citation-ready", tone: "verified", citeable: true };
  if (status === "disputed") return { label: "Disputed — do not cite", tone: "disputed", citeable: false };
  if (status === "unknown") return { label: "Needs verification", tone: "unknown", citeable: false };
  return { label: "Needs review", tone: "needs_review", citeable: false };
}
