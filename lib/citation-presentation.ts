import { getRegistryBundleBySlug } from "./data";
import { getRegistryBundleFromSupabase } from "./supabase-documents";
import { getClaimCitationStatus, getDocumentCitationStatus } from "./citation-status";
import { documentPageUrl, siteUrl } from "./urls";
import { getCitationPolicyBlock, normalizeCitationSurface } from "./render";
import type { ClaimSource, RegistryDocumentBundle } from "./types";

export type CitationPresentationBundle = Awaited<ReturnType<typeof buildCitationPresentation>>;

export async function loadCitationDocumentBundle(slug: string): Promise<RegistryDocumentBundle | null> {
  return getRegistryBundleBySlug(slug) ?? await getRegistryBundleFromSupabase(slug);
}

export function publisherName(source: ClaimSource): string | null {
  if (source.title?.trim()) return source.title.trim();
  if (!source.url) return null;
  try {
    return new URL(source.url).hostname.replace(/^www\./, "");
  } catch {
    return source.url;
  }
}

export function sourceReference(source: ClaimSource) {
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

export async function buildCitationPresentation(slug: string) {
  const bundle = await loadCitationDocumentBundle(slug);
  if (!bundle) return null;

  const { entity, document, claims } = bundle;
  const docStatus = getDocumentCitationStatus(bundle);
  const freshnessWindowDays = docStatus.freshnessWindowDays;
  const canonicalUrl = documentPageUrl(document.slug, document.lang);
  const checkedDate = docStatus.oldestVerifiedAt ?? document.last_verified_at ?? null;
  const normalizedCitation = normalizeCitationSurface(bundle);
  const citationPolicyBlock = getCitationPolicyBlock(bundle, document.lang);
  const annotatedClaims = claims.map((claim) => ({ claim, citationStatus: getClaimCitationStatus(claim, freshnessWindowDays) }));

  const toCitableClaim = ({ claim, citationStatus }: (typeof annotatedClaims)[number]) => ({
    claim_id: claim.id,
    field_path: claim.field_path,
    claim_text: claim.claim_text,
    verified_value: claim.claim_value,
    confidence: claim.confidence,
    status: claim.status,
    can_cite: citationStatus.isCitationReady && citationStatus.freshness !== "stale",
    reason_if_not_citable: citationStatus.isCitationReady && citationStatus.freshness !== "stale" ? null : citationStatus.reason,
    freshness: citationStatus.freshness,
    checked_date: claim.last_verified_at,
    sources: claim.sources.map(sourceReference),
  });

  const verifiedClaims = annotatedClaims.filter(({ citationStatus }) => citationStatus.isCitationReady && citationStatus.freshness !== "stale").map(toCitableClaim);
  const staleClaims = annotatedClaims.filter(({ citationStatus }) => citationStatus.isCitationReady && citationStatus.freshness === "stale").map(toCitableClaim);
  const excludedClaims = annotatedClaims.filter(({ citationStatus }) => !citationStatus.isCitationReady).map(({ claim, citationStatus }) => ({
    claim_id: claim.id,
    field_path: claim.field_path,
    status: claim.status,
    confidence: claim.confidence,
    can_cite: false,
    reason_if_not_citable: citationStatus.reason,
    reason: citationStatus.reason,
    sources: claim.sources.map(sourceReference),
  }));

  const sourceUrls = Array.from(new Set(verifiedClaims.flatMap((claim) => claim.sources.map((source) => source.url).filter((url): url is string => Boolean(url)))));
  const publisherNames = Array.from(new Set(verifiedClaims.flatMap((claim) => claim.sources.map((source) => source.publisher_name).filter((name): name is string => Boolean(name)))));
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

  return { bundle, entity, document, docStatus, canonicalUrl, checkedDate, citationPolicyBlock, normalizedCitation, verifiedClaims, staleClaims, excludedClaims, sourceUrls, publisherNames, canCiteDocument, recommendedCitationText };
}

export function buildBadgeSnippet(slug: string): string {
  const src = siteUrl(`/embed/${slug}`);
  return `<iframe src="${src}" title="For-Ai citation badge" sandbox="allow-popups allow-popups-to-escape-sandbox" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" width="360" height="220"></iframe>`;
}
