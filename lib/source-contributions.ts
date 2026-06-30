export const SOURCE_CONTRIBUTION_POINTS = {
  submitted: 2,
  duplicateSubmitted: 0,
  adminAccepted: 10,
  linkedToVerifiedClaim: 50,
} as const;

export type ContributionEventType =
  | "source_submitted"
  | "source_duplicate_submitted"
  | "source_admin_accepted"
  | "source_linked_verified_claim";

export function normalizeSourceUrl(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw.startsWith("www.") ? `https://${raw}` : raw);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) {
      url.port = "";
    }
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    const removable = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"];
    removable.forEach((key) => url.searchParams.delete(key));
    url.searchParams.sort();
    return url.toString();
  } catch {
    return raw.toLowerCase();
  }
}

export function pointEventForSubmission(isDuplicate: boolean): { eventType: ContributionEventType; points: number } {
  return isDuplicate
    ? { eventType: "source_duplicate_submitted", points: SOURCE_CONTRIBUTION_POINTS.duplicateSubmitted }
    : { eventType: "source_submitted", points: SOURCE_CONTRIBUTION_POINTS.submitted };
}
