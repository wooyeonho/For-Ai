import { SUPPORTED_LOCALES } from "./i18n";
import type { ClaimSource, ClaimStatus, Confidence, Document, VerificationEvent } from "./types";

export type QualityClaim = {
  status?: ClaimStatus | string | null;
  confidence?: Confidence | string | null;
  claim_value?: string | null;
  last_verified_at?: string | null;
  sources?: ClaimSource[];
  claim_sources?: ClaimSource[];
  verification_events?: VerificationEvent[];
};

export type DocumentQualityInput = {
  document: Pick<Document, "slug" | "lang" | "status" | "confidence" | "localized_title" | "last_verified_at" | "updated_at" | "freshness_ttl_days"> & Partial<Document>;
  claims: QualityClaim[];
  now?: Date;
};

export type DocumentQualityComponent = {
  key: string;
  label: string;
  score: number;
  weight: number;
  detail: string;
};

export type DocumentQualityScore = {
  score: number;
  grade: "excellent" | "good" | "review" | "poor";
  components: {
    claimCoverage: DocumentQualityComponent;
    sourceCoverage: DocumentQualityComponent;
    verificationStatus: DocumentQualityComponent;
    freshness: DocumentQualityComponent;
    i18nCoverage: DocumentQualityComponent;
    citationSurfaces: DocumentQualityComponent;
    correctionReportLinks: DocumentQualityComponent;
  };
  summary: string;
};

const WEIGHTS = {
  claimCoverage: 20,
  sourceCoverage: 20,
  verificationStatus: 20,
  freshness: 15,
  i18nCoverage: 10,
  citationSurfaces: 10,
  correctionReportLinks: 5,
} as const;

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function ratioScore(numerator: number, denominator: number) {
  return denominator > 0 ? clampScore((numerator / denominator) * 100) : 0;
}

function sourcesFor(claim: QualityClaim) {
  return claim.sources ?? claim.claim_sources ?? [];
}

function verifiedAtMs(document: DocumentQualityInput["document"], claims: QualityClaim[]) {
  const values = [document.last_verified_at, ...claims.map((claim) => claim.last_verified_at)]
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite);
  return values.length > 0 ? Math.max(...values) : null;
}

function gradeFor(score: number): DocumentQualityScore["grade"] {
  if (score >= 85) return "excellent";
  if (score >= 70) return "good";
  if (score >= 45) return "review";
  return "poor";
}

export function calculateDocumentQuality(input: DocumentQualityInput): DocumentQualityScore {
  const { document, claims } = input;
  const now = input.now ?? new Date();
  const totalClaims = claims.length;
  const knownClaims = claims.filter((claim) => claim.claim_value && claim.claim_value !== "확인 필요" && claim.status !== "unknown").length;
  const sourcedClaims = claims.filter((claim) => sourcesFor(claim).length > 0).length;
  const verifiedClaims = claims.filter((claim) => claim.status === "verified").length;
  const sourceBackedVerifiedClaims = claims.filter((claim) => claim.status === "verified" && sourcesFor(claim).length > 0).length;
  const lowConfidenceClaims = claims.filter((claim) => claim.confidence === "low").length;
  const verifiedAt = verifiedAtMs(document, claims);
  const ttlDays = document.freshness_ttl_days ?? 180;
  const ageDays = verifiedAt === null ? null : Math.max(0, Math.floor((now.getTime() - verifiedAt) / (24 * 60 * 60 * 1000)));
  const freshnessScore = ageDays === null ? 0 : clampScore(100 - (ageDays / ttlDays) * 100);
  const localizedTitleCount = Object.values(document.localized_title ?? {}).filter(Boolean).length;
  const hasDocumentLanguage = Boolean(document.lang);
  const i18nScore = clampScore(Math.max(hasDocumentLanguage ? 35 : 0, ratioScore(localizedTitleCount, SUPPORTED_LOCALES.length)));
  const citationSurfaceCount = [
    Boolean(document.slug),
    Boolean(document.slug),
    Boolean(document.slug),
    Boolean(document.slug),
  ].filter(Boolean).length;
  const correctionLinks = [Boolean(document.slug), Boolean(document.slug)].filter(Boolean).length;

  const components = {
    claimCoverage: {
      key: "claimCoverage",
      label: "Claim coverage",
      score: totalClaims === 0 ? 0 : clampScore(ratioScore(knownClaims, totalClaims) * 0.7 + Math.min(totalClaims, 5) * 6),
      weight: WEIGHTS.claimCoverage,
      detail: `${knownClaims}/${totalClaims} claims have concrete values`,
    },
    sourceCoverage: {
      key: "sourceCoverage",
      label: "Source coverage",
      score: ratioScore(sourcedClaims, totalClaims),
      weight: WEIGHTS.sourceCoverage,
      detail: `${sourcedClaims}/${totalClaims} claims have source rows`,
    },
    verificationStatus: {
      key: "verificationStatus",
      label: "Verification status",
      score: clampScore(ratioScore(sourceBackedVerifiedClaims, totalClaims) * 0.8 + ratioScore(verifiedClaims, totalClaims) * 0.2 - lowConfidenceClaims * 5),
      weight: WEIGHTS.verificationStatus,
      detail: `${sourceBackedVerifiedClaims}/${totalClaims} source-backed verified claims`,
    },
    freshness: {
      key: "freshness",
      label: "Freshness",
      score: freshnessScore,
      weight: WEIGHTS.freshness,
      detail: ageDays === null ? "No verified timestamp" : `${ageDays} days since last verification; TTL ${ttlDays} days`,
    },
    i18nCoverage: {
      key: "i18nCoverage",
      label: "i18n coverage",
      score: i18nScore,
      weight: WEIGHTS.i18nCoverage,
      detail: `${localizedTitleCount}/${SUPPORTED_LOCALES.length} localized titles; document lang ${document.lang ?? "unknown"}`,
    },
    citationSurfaces: {
      key: "citationSurfaces",
      label: "Citation surfaces",
      score: ratioScore(citationSurfaceCount, 4),
      weight: WEIGHTS.citationSurfaces,
      detail: document.slug ? "Canonical page, JSON API, raw Markdown, diagnostics routes available" : "Missing slug for citation routes",
    },
    correctionReportLinks: {
      key: "correctionReportLinks",
      label: "Correction/report links",
      score: ratioScore(correctionLinks, 2),
      weight: WEIGHTS.correctionReportLinks,
      detail: document.slug ? "Correction and hallucination report links available" : "Missing slug for report routes",
    },
  };

  const weighted = Object.values(components).reduce((sum, component) => sum + component.score * component.weight, 0);
  const totalWeight = Object.values(WEIGHTS).reduce((sum, weight) => sum + weight, 0);
  const score = clampScore(weighted / totalWeight);

  return {
    score,
    grade: gradeFor(score),
    components,
    summary: `${score}/100 · ${sourceBackedVerifiedClaims}/${totalClaims} source-backed verified claims · ${sourcedClaims}/${totalClaims} sourced`,
  };
}
