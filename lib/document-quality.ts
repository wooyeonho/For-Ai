import { getDocumentCitationStatus, UNKNOWN_FACT_TEXT, ageInDays, isStale } from "./citation-status";
import { SUPPORTED_LOCALES } from "./i18n/locales";
import { normalizeCitationSurface } from "./render";
import type { ClaimStatus, Confidence, DocumentStatus, RegistryDocumentBundle, TranslationStatus, UpdateFrequency } from "./types";

export type DocumentQualityGrade = "excellent" | "good" | "needs_work" | "poor";
export type DocumentQualityFactorKey =
  | "claim_coverage"
  | "source_coverage"
  | "verification_status"
  | "freshness"
  | "i18n_coverage"
  | "citation_surface_coverage"
  | "correction_report_cta";

export type DocumentQualityFactor = {
  key: DocumentQualityFactorKey;
  label: string;
  score: number;
  maxScore: number;
  summary: string;
  nextTask: string | null;
  adminHref?: string;
  publicHref?: string;
};

export type DocumentQualitySummary = {
  score: number;
  maxScore: number;
  percent: number;
  grade: DocumentQualityGrade;
  label: string;
  publicLabel: string;
  factors: DocumentQualityFactor[];
  nextTasks: string[];
  publicNextTasks: string[];
  isPublicSafe: true;
};

export type QualityClaim = {
  id?: string;
  field_path?: string | null;
  claim_value?: string | null;
  confidence?: Confidence | string | null;
  status?: ClaimStatus | string | null;
  last_verified_at?: string | null;
  updated_at?: string | null;
  sources?: unknown[];
  claim_sources?: unknown[];
  verification_events?: unknown[];
  update_frequency?: UpdateFrequency | string | null;
};

export type QualityDocument = {
  slug: string;
  lang?: string | null;
  status?: DocumentStatus | string | null;
  confidence?: Confidence | string | null;
  last_verified_at?: string | null;
  updated_at?: string | null;
  localized_title?: Record<string, string> | null;
  translation_status?: TranslationStatus | string | null;
  update_frequency?: UpdateFrequency | string | null;
};

export type QualityInput = {
  document: QualityDocument;
  claims: QualityClaim[];
};

const MAX_SCORE = 100;
const SOURCE_MAX = 18;
const CLAIM_MAX = 16;
const VERIFY_MAX = 22;
const FRESH_MAX = 14;
const I18N_MAX = 10;
const SURFACE_MAX = 12;
const CTA_MAX = 8;

function clampScore(value: number, max: number) {
  return Math.max(0, Math.min(max, Math.round(value)));
}

function ratio(count: number, total: number) {
  return total > 0 ? count / total : 0;
}

function sourceList(claim: QualityClaim): unknown[] {
  return claim.sources ?? claim.claim_sources ?? [];
}

function hasKnownValue(claim: QualityClaim) {
  const value = claim.claim_value?.trim() ?? "";
  return value.length > 0 && value !== UNKNOWN_FACT_TEXT && value.toLowerCase() !== "needs verification";
}

function verifiedClaimCount(claims: QualityClaim[]) {
  return claims.filter((claim) => claim.status === "verified" && claim.confidence !== "low" && hasKnownValue(claim) && sourceList(claim).length > 0).length;
}

function gradeFor(percent: number): DocumentQualityGrade {
  if (percent >= 90) return "excellent";
  if (percent >= 75) return "good";
  if (percent >= 50) return "needs_work";
  return "poor";
}

function gradeLabel(grade: DocumentQualityGrade) {
  return {
    excellent: "Excellent",
    good: "Good",
    needs_work: "Needs work",
    poor: "Poor",
  }[grade];
}

function freshnessFactor(document: QualityDocument, claims: QualityClaim[]): DocumentQualityFactor {
  const verifiedDates = claims
    .filter((claim) => claim.status === "verified")
    .map((claim) => claim.last_verified_at)
    .filter((value): value is string => Boolean(value));
  const oldest = verifiedDates.length > 0
    ? verifiedDates.reduce((oldestDate, current) => (Date.parse(current) < Date.parse(oldestDate) ? current : oldestDate))
    : document.last_verified_at;
  const stale = isStale(oldest);
  const age = ageInDays(oldest);
  return {
    key: "freshness",
    label: "Freshness",
    score: clampScore(!oldest ? 0 : stale ? FRESH_MAX * 0.35 : FRESH_MAX, FRESH_MAX),
    maxScore: FRESH_MAX,
    summary: oldest ? `${age ?? "?"} days since oldest verification` : "No verification date yet",
    nextTask: !oldest || stale ? "Re-check stale or undated claims and update last_verified_at." : null,
    adminHref: `/admin/verify-claim?slug=${encodeURIComponent(document.slug)}`,
  };
}

export function calculateDocumentQuality(input: QualityInput): DocumentQualitySummary {
  const { document, claims } = input;
  const totalClaims = claims.length;
  const knownClaims = claims.filter(hasKnownValue).length;
  const sourcedClaims = claims.filter((claim) => sourceList(claim).length > 0).length;
  const verifiedClaims = verifiedClaimCount(claims);
  const claimCoverage = ratio(knownClaims, totalClaims);
  const sourceCoverage = ratio(sourcedClaims, totalClaims);
  const verificationCoverage = ratio(verifiedClaims, totalClaims);
  const localizedTitles = document.localized_title ?? {};
  const localizedCount = SUPPORTED_LOCALES.filter((locale) => Boolean(localizedTitles[locale]?.trim()) || document.lang === locale).length;
  const i18nScore = document.translation_status === "human_reviewed" || document.translation_status === "human_translated"
    ? I18N_MAX
    : Math.max(2, Math.round(I18N_MAX * ratio(localizedCount, SUPPORTED_LOCALES.length)));
  const citationSurfaceScore = (() => {
    try {
      if (!("entity" in input)) return SURFACE_MAX;
      const normalized = normalizeCitationSurface(input as RegistryDocumentBundle);
      const normalizedClaims = normalized.claims.length === totalClaims;
      const hasUrls = Boolean(normalized.sitemap.url) && normalized.claims.every((claim) => claim.entity_id && claim.slug && claim.field_path);
      return normalizedClaims && hasUrls ? SURFACE_MAX : Math.round(SURFACE_MAX * 0.5);
    } catch {
      return SURFACE_MAX * 0.5;
    }
  })();

  const factors: DocumentQualityFactor[] = [
    {
      key: "claim_coverage",
      label: "Claim coverage",
      score: clampScore(CLAIM_MAX * claimCoverage, CLAIM_MAX),
      maxScore: CLAIM_MAX,
      summary: `${knownClaims}/${totalClaims} claims have known values`,
      nextTask: claimCoverage < 1 ? "Fill unknown claims as 확인 필요 until a source-backed value is found." : null,
      adminHref: `/admin/verify-claim?slug=${encodeURIComponent(document.slug)}`,
    },
    {
      key: "source_coverage",
      label: "Source coverage",
      score: clampScore(SOURCE_MAX * sourceCoverage, SOURCE_MAX),
      maxScore: SOURCE_MAX,
      summary: `${sourcedClaims}/${totalClaims} claims have at least one source`,
      nextTask: sourceCoverage < 1 ? "Attach official or traceable sources to unsourced claims." : null,
      adminHref: `/admin/verify-claim?slug=${encodeURIComponent(document.slug)}`,
    },
    {
      key: "verification_status",
      label: "Verification status",
      score: clampScore(VERIFY_MAX * verificationCoverage, VERIFY_MAX),
      maxScore: VERIFY_MAX,
      summary: `${verifiedClaims}/${totalClaims} claims are verified and source-backed`,
      nextTask: verificationCoverage < 1 ? "Review remaining claims and create verification events before document verification." : null,
      adminHref: `/admin/verify-claim?slug=${encodeURIComponent(document.slug)}`,
    },
    freshnessFactor(document, claims),
    {
      key: "i18n_coverage",
      label: "i18n coverage",
      score: clampScore(i18nScore, I18N_MAX),
      maxScore: I18N_MAX,
      summary: `${localizedCount}/${SUPPORTED_LOCALES.length} locale titles or source locale present`,
      nextTask: localizedCount < SUPPORTED_LOCALES.length ? "Add localized display titles and review machine translations." : null,
    },
    {
      key: "citation_surface_coverage",
      label: "Citation surface coverage",
      score: clampScore(citationSurfaceScore, SURFACE_MAX),
      maxScore: SURFACE_MAX,
      summary: "Canonical page, JSON, raw markdown, and normalized citation surfaces are expected.",
      nextTask: citationSurfaceScore < SURFACE_MAX ? "Repair missing canonical/API/raw citation fields." : null,
      publicHref: `/diagnostics/${encodeURIComponent(document.slug)}`,
    },
    {
      key: "correction_report_cta",
      label: "Correction/report CTA",
      score: CTA_MAX,
      maxScore: CTA_MAX,
      summary: `/report/${document.slug} and hallucination report surfaces available`,
      nextTask: null,
      publicHref: `/report/${encodeURIComponent(document.slug)}`,
    },
  ];

  const score = clampScore(factors.reduce((sum, factor) => sum + factor.score, 0), MAX_SCORE);
  const percent = score;
  const grade = gradeFor(percent);
  const nextTasks = factors.flatMap((factor) => factor.nextTask ? [factor.nextTask] : []);
  return {
    score,
    maxScore: MAX_SCORE,
    percent,
    grade,
    label: gradeLabel(grade),
    publicLabel: gradeLabel(grade),
    factors,
    nextTasks: nextTasks.length > 0 ? nextTasks : ["Keep monitoring freshness and citation pickup metrics."],
    publicNextTasks: nextTasks.length > 0 ? nextTasks.slice(0, 3) : ["No immediate public-facing quality gaps."],
    isPublicSafe: true,
  };
}

export function calculateBundleDocumentQuality(bundle: RegistryDocumentBundle): DocumentQualitySummary {
  const citationStatus = getDocumentCitationStatus(bundle);
  const summary = calculateDocumentQuality(bundle);
  const citationFactor = summary.factors.find((factor) => factor.key === "citation_surface_coverage");
  if (citationFactor) {
    citationFactor.summary = `${citationStatus.verifiedClaims}/${citationStatus.totalClaims} citable claims · ${citationStatus.label}`;
  }
  return summary;
}
