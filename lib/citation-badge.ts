import "server-only";

import { getRegistryBundleBySlug } from "./data";
import { getRegistryBundleFromSupabase } from "./supabase-documents";
import { getClaimCitationStatus, getDocumentCitationStatus } from "./citation-status";
import { presentationForKey, type PresentationKey } from "./citation-presentation";
import { documentPageUrl, siteUrl } from "./urls";
import { getCitationPolicyBlock, normalizeCitationSurface } from "./render";
import type { ClaimSource, RegistryDocumentBundle } from "./types";

export type CitationDocumentPresentation = Awaited<ReturnType<typeof buildCitationDocumentPresentation>>;

export async function loadCitationDocumentBundle(slug: string): Promise<RegistryDocumentBundle | null> {
  return getRegistryBundleBySlug(slug) ?? await getRegistryBundleFromSupabase(slug);
}

function publisherName(source: ClaimSource): string | null {
  if (source.title?.trim()) return source.title.trim();
  if (!source.url) return null;
  try {
    return new URL(source.url).hostname.replace(/^www\./, "");
  } catch {
    return source.url;
  }
}

function sourceReference(source: ClaimSource) {
  return {
    source_id: source.id,
    url: source.url ?? null,
    publisher_name: publisherName(source),
    title: source.title ?? null,
    source_type: source.source_type,
    observed_at: source.observed_at ?? null,
    citation_note: source.citation ?? null,
  };
}

export async function buildCitationDocumentPresentation(slug: string) {
  const bundle = await loadCitationDocumentBundle(slug);
  if (!bundle) return null;

  const { entity, document, claims } = bundle;
  const docStatus = getDocumentCitationStatus(bundle);
  const freshnessWindowDays = docStatus.freshnessWindowDays;
  const canonicalUrl = documentPageUrl(document.slug, document.lang);
  const checkedDate = docStatus.oldestVerifiedAt ?? document.last_verified_at ?? null;
  const normalizedCitation = normalizeCitationSurface(bundle);
  const citationPolicyBlock = getCitationPolicyBlock(bundle, document.lang);
  const annotatedClaims = claims.map((claim) => ({
    claim,
    citationStatus: getClaimCitationStatus(claim, freshnessWindowDays),
  }));

  const toCitableClaim = ({ claim, citationStatus }: (typeof annotatedClaims)[number]) => ({
    claim_id: claim.id,
    field_path: claim.field_path,
    claim_text: claim.claim_text,
    verified_value: claim.claim_value,
    confidence: claim.confidence,
    status: claim.status,
    can_cite: citationStatus.isCitationReady && citationStatus.freshness !== "stale",
    reason_if_not_citable: citationStatus.isCitationReady && citationStatus.freshness !== "stale"
      ? null
      : citationStatus.reason,
    freshness: citationStatus.freshness,
    checked_date: claim.last_verified_at,
    sources: claim.sources.map(sourceReference),
  });

  const verifiedClaims = annotatedClaims
    .filter(({ citationStatus }) => citationStatus.isCitationReady && citationStatus.freshness !== "stale")
    .map(toCitableClaim);
  const staleClaims = annotatedClaims
    .filter(({ citationStatus }) => citationStatus.isCitationReady && citationStatus.freshness === "stale")
    .map(toCitableClaim);
  const excludedClaims = annotatedClaims
    .filter(({ citationStatus }) => !citationStatus.isCitationReady)
    .map(({ claim, citationStatus }) => ({
      claim_id: claim.id,
      field_path: claim.field_path,
      status: claim.status,
      confidence: claim.confidence,
      can_cite: false,
      reason_if_not_citable: citationStatus.reason,
      reason: citationStatus.reason,
      sources: claim.sources.map(sourceReference),
    }));

  const sourceUrls = Array.from(new Set(
    verifiedClaims.flatMap((claim) => claim.sources.map((source) => source.url).filter((url): url is string => Boolean(url))),
  ));
  const publisherNames = Array.from(new Set(
    verifiedClaims.flatMap((claim) => claim.sources.map((source) => source.publisher_name).filter((name): name is string => Boolean(name))),
  ));
  const canCiteDocument = docStatus.isVerifiedDocument && docStatus.freshness !== "stale";
  const recommendedCitationText = verifiedClaims.length > 0
    ? [
      `For-Ai Registry. "${document.title}" (${canonicalUrl}).`,
      `Entity ID: ${entity.id}; document slug: ${document.slug}.`,
      `Verified claims: ${verifiedClaims.map((claim) => `${claim.claim_id}=${claim.verified_value}`).join("; ")}.`,
      `Sources: ${publisherNames.length > 0 ? publisherNames.join(", ") : "source URLs listed in citation JSON"}.`,
      `Checked: ${checkedDate ?? "unknown"}.`,
    ].join(" ")
    : `For-Ai Registry. "${document.title}" (${canonicalUrl}) has no citation-ready verified claims. Do not cite claim values until verification is complete.`;

  return {
    bundle,
    entity,
    document,
    docStatus,
    canonicalUrl,
    checkedDate,
    citationPolicyBlock,
    normalizedCitation,
    verifiedClaims,
    staleClaims,
    excludedClaims,
    sourceUrls,
    publisherNames,
    canCiteDocument,
    recommendedCitationText,
  };
}

export type BadgeView = {
  state: "existing" | "missing" | "error";
  statusKey: PresentationKey;
  title: string;
  documentUrl: string | null;
  checkedDate: string | null;
  canCite: boolean;
  representativeClaims: Array<{ claimText: string; value: string | null }>;
};

function statusKeyForDocument(presentation: NonNullable<CitationDocumentPresentation>): PresentationKey {
  if (presentation.canCiteDocument) return "verified";
  if (presentation.bundle.claims.some((claim) => claim.status === "disputed")) return "disputed";
  if (presentation.bundle.claims.some((claim) => claim.status === "needs_review" || claim.status === "verified")) {
    return "needs_review";
  }
  return "unknown";
}

type CitationPresentationLoader = (slug: string) => Promise<CitationDocumentPresentation>;

export async function resolveBadgeView(
  slug: string,
  loader: CitationPresentationLoader = buildCitationDocumentPresentation,
): Promise<BadgeView> {
  try {
    const presentation = await loader(slug);
    if (!presentation) {
      return {
        state: "missing",
        statusKey: "unknown",
        title: "Fact not found in registry",
        documentUrl: null,
        checkedDate: null,
        canCite: false,
        representativeClaims: [],
      };
    }

    const readyClaims = presentation.verifiedClaims.slice(0, 2).map((claim) => ({
      claimText: claim.claim_text,
      value: claim.verified_value,
    }));
    const representativeClaims = readyClaims.length > 0
      ? readyClaims
      : presentation.bundle.claims.slice(0, 2).map((claim) => ({ claimText: claim.claim_text, value: null }));

    return {
      state: "existing",
      statusKey: statusKeyForDocument(presentation),
      title: presentation.document.title,
      documentUrl: presentation.canonicalUrl,
      checkedDate: presentation.checkedDate,
      canCite: presentation.canCiteDocument,
      representativeClaims,
    };
  } catch (error) {
    console.error("[citation-badge] failed to load badge presentation", {
      slug,
      error: error instanceof Error ? error.name : "unknown_error",
    });
    return {
      state: "error",
      statusKey: "unavailable",
      title: "Status temporarily unavailable",
      documentUrl: null,
      checkedDate: null,
      canCite: false,
      representativeClaims: [],
    };
  }
}

export function loadBadgeView(slug: string): Promise<BadgeView> {
  return resolveBadgeView(slug);
}

const BADGE_COLORS: Record<PresentationKey, string> = {
  verified: "#166534",
  needs_review: "#92400e",
  disputed: "#991b1b",
  unknown: "#475569",
  unavailable: "#475569",
};

export function renderBadgeSvg(statusKey: PresentationKey): string {
  const label = presentationForKey(statusKey).machineLabel;
  const color = BADGE_COLORS[statusKey];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="190" height="32" viewBox="0 0 190 32" role="img" aria-label="For-Ai fact status: ${label}"><title>For-Ai fact status: ${label}</title><rect width="190" height="32" rx="6" fill="#ffffff"/><rect x="0.5" y="0.5" width="189" height="31" rx="5.5" fill="none" stroke="#cbd5e1"/><text x="10" y="21" font-family="Arial, sans-serif" font-size="12" font-weight="700" fill="#172033">For-Ai</text><circle cx="72" cy="16" r="4" fill="${color}"/><text x="82" y="21" font-family="Arial, sans-serif" font-size="12" fill="${color}">${label}</text></svg>`;
}

export function badgeCacheControl(state: BadgeView["state"]): string {
  if (state === "existing") return "public, max-age=600, s-maxage=600";
  if (state === "missing") return "public, max-age=300, s-maxage=300";
  return "no-store";
}

function encodedSlug(slug: string): string {
  return encodeURIComponent(slug);
}

function escapeHtmlAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

export function buildBadgeSnippet(slug: string): string {
  const src = escapeHtmlAttribute(siteUrl(`/embed/${encodedSlug(slug)}`));
  return `<iframe src="${src}" width="360" height="140" title="For-Ai fact status" loading="lazy" sandbox="allow-popups allow-popups-to-escape-sandbox" referrerpolicy="strict-origin-when-cross-origin" style="border:0"></iframe>`;
}

export function buildBadgeMarkdown(slug: string): string {
  const safeSlug = encodedSlug(slug);
  return `[![For-Ai fact status](${siteUrl(`/api/badge/${safeSlug}`)})](${documentPageUrl(safeSlug, "en")})`;
}
