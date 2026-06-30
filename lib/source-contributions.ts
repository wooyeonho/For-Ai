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

export const PUBLIC_SOURCE_URL_MAX_LENGTH = 2048;
export const INVALID_PUBLIC_SOURCE_URL_CODE = "INVALID_SOURCE_URL";
export const INVALID_PUBLIC_SOURCE_URL_STATUS = 400;
export const INVALID_PUBLIC_SOURCE_URL_ERROR = "source_url must be a valid http(s) URL";

const REMOVABLE_TRACKING_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
];

export type PublicSourceUrlParseResult =
  | { ok: true; url: string }
  | { ok: false; code: typeof INVALID_PUBLIC_SOURCE_URL_CODE; error: typeof INVALID_PUBLIC_SOURCE_URL_ERROR; status: typeof INVALID_PUBLIC_SOURCE_URL_STATUS };

export function invalidPublicSourceUrl(): Extract<PublicSourceUrlParseResult, { ok: false }> {
  return {
    ok: false,
    code: INVALID_PUBLIC_SOURCE_URL_CODE,
    error: INVALID_PUBLIC_SOURCE_URL_ERROR,
    status: INVALID_PUBLIC_SOURCE_URL_STATUS,
  };
}

export function parsePublicSourceUrl(input: string | null | undefined): PublicSourceUrlParseResult {
  const raw = input?.trim();
  if (!raw || raw.length > PUBLIC_SOURCE_URL_MAX_LENGTH) return invalidPublicSourceUrl();

  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return invalidPublicSourceUrl();
    if (!url.hostname) return invalidPublicSourceUrl();

    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) {
      url.port = "";
    }
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    REMOVABLE_TRACKING_PARAMS.forEach((key) => url.searchParams.delete(key));
    url.searchParams.sort();

    return { ok: true, url: url.toString() };
  } catch {
    return invalidPublicSourceUrl();
  }
}

export function normalizeSourceUrl(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const parsed = parsePublicSourceUrl(value);
  return parsed.ok ? parsed.url : null;
}

export function pointEventForSubmission(isDuplicate: boolean): { eventType: ContributionEventType; points: number } {
  return isDuplicate
    ? { eventType: "source_duplicate_submitted", points: SOURCE_CONTRIBUTION_POINTS.duplicateSubmitted }
    : { eventType: "source_submitted", points: SOURCE_CONTRIBUTION_POINTS.submitted };
}
