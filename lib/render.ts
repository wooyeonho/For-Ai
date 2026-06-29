import { getClaimCitationStatus, getDocumentCitationStatus, UNKNOWN_FACT_TEXT } from "./citation-status";
import type { ClaimSource, Confidence, RegistryDocumentBundle } from "./types";
import { apiDocumentUrl, documentPageUrl, rawMarkdownUrl } from "./urls";

export type RenderedClaim = RegistryDocumentBundle["claims"][number] & {
  citation_ready: boolean;
};

export type RenderedDirectAnswer = {
  question: string;
  answer: string;
  region: string;
  last_verified_at: string | null;
  confidence: Confidence;
  source_count: number;
  can_cite: boolean;
  related_questions: string[];
};

export type RenderedDocumentJson = {
  entity: RegistryDocumentBundle["entity"];
  document: RegistryDocumentBundle["document"];
  claims: RenderedClaim[];
  listing: RegistryDocumentBundle["listing"];
  direct_answer: RenderedDirectAnswer;
  citation_guidance: {
    can_cite: boolean;
    do_not_cite_reason: string | null;
    verified_claims_count: number;
    total_claims_count: number;
    unverified_claim_paths: string[];
    freshness: "fresh" | "stale" | "unknown";
    oldest_verified_at: string | null;
    freshness_window_days: number;
    stale_claims: Array<{ claimId: string; fieldPath: string; lastVerifiedAt: string | null }>;
  };
  machine_readable: {
    canonical_url: string;
    json_url: string;
    raw_markdown_url: string;
  };
  update_status: {
    last_verified_at: string;
    updated_at: string;
    rule: string;
  };
  normalized_citation: NormalizedCitationSurface;
};

export type NormalizedCitationClaim = {
  entity_id: string;
  slug: string;
  field_path: string;
  claim_value: string;
  status: string;
  confidence: string;
  source_url: string | null;
  source_publisher: string | null;
  last_verified_at: string | null;
};

export type NormalizedCitationSurface = {
  entity_id: string;
  slug: string;
  claims: NormalizedCitationClaim[];
  sitemap: {
    slug: string;
    url: string;
    last_verified_at: string | null;
  };
};

const UNKNOWN_TEXT = UNKNOWN_FACT_TEXT;
const GOVERNMENT_FEE_FIELD_PATHS = [
  "fee.amount",
  "fee.adult",
  "fee.child",
  "processing.standard",
  "processing.expedited",
  "required_documents",
  "application_channel",
  "official_page",
];
const GOVERNMENT_FEE_DISCLAIMER =
  "Always check the official government source before applying.";

function isGovernmentFeeDocument(bundle: RegistryDocumentBundle): boolean {
  const disclaimerType = bundle.document.data.disclaimer_type;
  const category = bundle.document.category.toLowerCase();
  const hasStandardGovernmentFeeClaim = bundle.claims.some((claim) =>
    GOVERNMENT_FEE_FIELD_PATHS.includes(claim.field_path),
  );

  return (
    disclaimerType === "check_official_source" &&
    hasStandardGovernmentFeeClaim &&
    (category.includes("government") || category.includes("administration"))
  );
}

function getStringArrayDataValue(data: Record<string, unknown>, key: string): string[] {
  const value = data[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

export function getDocumentQuestionTitle(bundle: RegistryDocumentBundle): string {
  const question = bundle.document.data.question;
  return typeof question === "string" && question.trim().length > 0 ? question : bundle.document.title;
}

export function getDocumentRegion(bundle: RegistryDocumentBundle): string {
  const data = bundle.document.data;
  const dataRegion = data.jurisdiction ?? data.region ?? data.country;
  if (typeof dataRegion === "string" && dataRegion.trim().length > 0) return dataRegion;
  return [bundle.document.country, bundle.entity.region, bundle.entity.city].filter(Boolean).join(" / ") || "global";
}

export function getRelatedQuestions(bundle: RegistryDocumentBundle): string[] {
  return getStringArrayDataValue(bundle.document.data, "related_questions");
}

export function getRenderedDirectAnswer(bundle: RegistryDocumentBundle): RenderedDirectAnswer {
  const citationStatus = getDocumentCitationStatus(bundle);
  const readyClaims = bundle.claims.filter((claim) => getClaimCitationStatus(claim).isCitationReady);
  const answer = readyClaims[0]?.claim_value ?? "Needs verification";
  return {
    question: getDocumentQuestionTitle(bundle),
    answer,
    region: getDocumentRegion(bundle),
    last_verified_at: readyClaims[0]?.last_verified_at ?? null,
    confidence: readyClaims[0]?.confidence ?? "low",
    source_count: readyClaims.reduce((count, claim) => count + claim.sources.length, 0),
    can_cite: citationStatus.isVerifiedDocument,
    related_questions: getRelatedQuestions(bundle),
  };
}

function getStringDataValue(data: Record<string, unknown>, key: string, fallback: string): string {
  const value = data[key];
  return typeof value === "string" ? value : fallback;
}

function renderSourceLabel(source: ClaimSource): string {
  return `${source.source_type}: ${source.title ?? source.url ?? source.citation ?? "unknown"}`;
}

function renderClaimSources(sources: ClaimSource[]): string {
  if (sources.length === 0) {
    return "    - none";
  }

  return sources.map((source) => `    - ${renderSourceLabel(source)}`).join("\n");
}

function renderTopLevelSources(claims: RegistryDocumentBundle["claims"]): string {
  const sources = claims.flatMap((claim) => claim.sources.map((source) => ({ claim, source })));

  if (sources.length === 0) {
    return "No sources are currently attached to the claims.";
  }

  return sources
    .map(({ claim, source }) => `- ${claim.field_path}: ${renderSourceLabel(source)}`)
    .join("\n");
}

/**
 * Canonical, minimal citation payload shared by human and machine-readable
 * surfaces. Keep these fields claim-level: if one surface drifts from this
 * normalized shape, CI should fail rather than letting AI-facing citations
 * disagree with the HTML page.
 */
export function normalizeCitationSurface(bundle: RegistryDocumentBundle): NormalizedCitationSurface {
  const { entity, document, claims } = bundle;

  return {
    entity_id: entity.id,
    slug: document.slug,
    claims: claims.map((claim) => {
      const primarySource = claim.sources[0] ?? null;
      return {
        entity_id: entity.id,
        slug: document.slug,
        field_path: claim.field_path,
        claim_value: claim.claim_value || UNKNOWN_TEXT,
        status: claim.status,
        confidence: claim.confidence,
        source_url: primarySource?.url ?? null,
        source_publisher: primarySource?.title ?? null,
        last_verified_at: claim.last_verified_at ?? null,
      };
    }),
    sitemap: {
      slug: document.slug,
      url: documentPageUrl(document.slug, document.lang),
      last_verified_at: document.last_verified_at ?? null,
    },
  };
}

export function renderDocumentJson(bundle: RegistryDocumentBundle): RenderedDocumentJson {
  const { document } = bundle;
  const normalizedCitation = normalizeCitationSurface(bundle);
  const citationStatus = getDocumentCitationStatus(bundle);
  const directAnswer = getRenderedDirectAnswer(bundle);
  const claimStatuses = bundle.claims.map((c) => ({ c, cs: getClaimCitationStatus(c) }));
  const verifiedCount = claimStatuses.filter((x) => x.cs.isCitationReady).length;
  const unverifiedPaths = claimStatuses.filter((x) => !x.cs.isCitationReady).map((x) => x.c.field_path);

  return {
    entity: bundle.entity,
    document,
    claims: claimStatuses.map(({ c, cs }) => ({ ...c, citation_ready: cs.isCitationReady })),
    listing: bundle.listing,
    direct_answer: directAnswer,
    citation_guidance: {
      can_cite: citationStatus.isVerifiedDocument,
      do_not_cite_reason: citationStatus.isVerifiedDocument
        ? null
        : `Document status is ${document.status}; ${citationStatus.verifiedClaims}/${citationStatus.totalClaims} claims are citation-ready. Unverified: ${unverifiedPaths.join(", ") || "none"}`,
      verified_claims_count: verifiedCount,
      total_claims_count: bundle.claims.length,
      unverified_claim_paths: unverifiedPaths,
      freshness: citationStatus.freshness,
      oldest_verified_at: citationStatus.oldestVerifiedAt,
      freshness_window_days: citationStatus.freshnessWindowDays,
      stale_claims: citationStatus.staleClaims,
    },
    machine_readable: {
      canonical_url: documentPageUrl(document.slug, document.lang),
      json_url: apiDocumentUrl(document.slug),
      raw_markdown_url: rawMarkdownUrl(document.slug),
    },
    update_status: {
      last_verified_at: document.last_verified_at ?? UNKNOWN_TEXT,
      updated_at: document.updated_at ?? UNKNOWN_TEXT,
      rule: "Unsourced or unknown facts must remain 확인 필요 with low confidence.",
    },
    normalized_citation: normalizedCitation,
  };
}

export function renderDocumentMarkdown(bundle: RegistryDocumentBundle): string {
  const { entity, document, claims } = bundle;
  const normalizedCitation = normalizeCitationSurface(bundle);
  const directAnswer = getRenderedDirectAnswer(bundle);
  const licenseNotice = getStringDataValue(
    document.data,
    "license_notice",
    "For-Ai Data License v0.1 placeholder.",
  );
  const docCitationStatus = getDocumentCitationStatus(bundle);
  const claimsMarkdown = claims
    .map((claim) => {
      const sources = renderClaimSources(claim.sources);
      const citationStatus = getClaimCitationStatus(claim, docCitationStatus.freshnessWindowDays);
      const displayValue = claim.claim_value || UNKNOWN_TEXT;
      const displayConfidence = displayValue === UNKNOWN_TEXT ? "low" : claim.confidence;

      const normalized = normalizedCitation.claims.find((item) => item.field_path === claim.field_path);

      return `- ${claim.field_path}: ${displayValue}\n  - claim: ${claim.claim_text}\n  - canonical entity_id: ${normalized?.entity_id ?? entity.id}\n  - canonical slug: ${normalized?.slug ?? document.slug}\n  - canonical source_url: ${normalized?.source_url ?? UNKNOWN_TEXT}\n  - canonical source_publisher: ${normalized?.source_publisher ?? UNKNOWN_TEXT}\n  - citation status: ${citationStatus.label}\n  - citation reason: ${citationStatus.reason}\n  - freshness: ${citationStatus.freshness}\n  - freshness_window_days: ${citationStatus.freshnessWindowDays}\n  - stale_warning: ${citationStatus.warning ?? "none"}\n  - confidence: ${displayConfidence}\n  - jurisdiction: ${claim.jurisdiction ?? "inherit"}\n  - verification status: ${claim.status}\n  - last_verified_at: ${claim.last_verified_at ?? UNKNOWN_TEXT}\n  - source_count: ${claim.sources.length}\n  - verification_event_count: ${claim.verification_events.length}\n  - sources:\n${sources}`;
    })
    .join("\n");
  const sourcesMarkdown = renderTopLevelSources(claims);
  const citationStatus = getDocumentCitationStatus(bundle);
  const governmentFeeTemplate = isGovernmentFeeDocument(bundle)
    ? `\n## Government fee template\n\nStandard claim field paths:\n${GOVERNMENT_FEE_FIELD_PATHS.map((fieldPath) => `- ${fieldPath}`).join("\n")}\n\nDisclaimer: ${GOVERNMENT_FEE_DISCLAIMER}\n`
    : "";

  return `# ${document.title}\n\nentity_id: ${entity.id}\ndocument_id: ${document.id}\nslug: ${document.slug}\nlang: ${document.lang}\ncountry: ${document.country}\nlicense_code: ${document.license_code}\n\n## Citation guidance\n\ncan_cite: ${docCitationStatus.isVerifiedDocument}\ndo_not_cite_reason: ${docCitationStatus.isVerifiedDocument ? "null" : `document status ${document.status}; ${docCitationStatus.verifiedClaims}/${docCitationStatus.totalClaims} claims citation-ready`}\n\nCite this document only if can_cite is true. Cite a claim only if its verification status is "verified" and it has at least one source plus a verification event. Do not cite values shown as "확인 필요", or claims with "low" confidence or "needs_review" status. Always preserve the source URL and last_verified_at when citing. Stale claims may remain citation-ready, but they must carry a last verified date warning and should be rechecked before reliance.\n\n## Document citation status

status: ${citationStatus.label}
citation_ready_claims: ${citationStatus.verifiedClaims}/${citationStatus.totalClaims}
freshness: ${citationStatus.freshness}${citationStatus.oldestVerifiedAt ? ` (oldest verified ${citationStatus.oldestVerifiedAt}; window ${citationStatus.freshnessWindowDays} days)` : ""}${governmentFeeTemplate}

## Direct answer\n\nquestion: ${directAnswer.question}\nanswer: ${directAnswer.answer}\nregion: ${directAnswer.region}\nlast_verified_at: ${directAnswer.last_verified_at ?? UNKNOWN_TEXT}\nconfidence: ${directAnswer.confidence}\nsource_count: ${directAnswer.source_count}\ncan_cite: ${directAnswer.can_cite}\nrelated_questions: ${directAnswer.related_questions.length > 0 ? directAnswer.related_questions.join(" | ") : "none"}\n\n## Claims\n\n${claimsMarkdown}\n\n## Confidence\n\n${document.confidence}\n\n## Verification status\n\n${document.status}\n\n## Sources\n\n${sourcesMarkdown}\n\n## License notice\n\n${licenseNotice}\n`;
}
