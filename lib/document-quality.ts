import type { ClaimStatus, Confidence, DocumentStatus, TranslationStatus } from "./types";

type QualitySource = {
  url?: string | null;
  citation?: string | null;
  title?: string | null;
};

type QualityClaim = {
  status?: ClaimStatus | string | null;
  confidence?: Confidence | string | null;
  claim_value?: string | null;
  last_verified_at?: string | null;
  updated_at?: string | null;
  sources?: QualitySource[];
  claim_sources?: QualitySource[];
};

type QualityDocument = {
  slug?: string | null;
  lang?: string | null;
  status?: DocumentStatus | string | null;
  confidence?: Confidence | string | null;
  last_verified_at?: string | null;
  updated_at?: string | null;
  localized_title?: Record<string, string> | null;
  translation_status?: TranslationStatus | string | null;
  data?: Record<string, unknown> | null;
  freshness_ttl_days?: number | null;
};

export type DocumentQualityFactorKey =
  | "claim_coverage"
  | "source_coverage"
  | "verification_status"
  | "freshness"
  | "i18n_coverage"
  | "citation_surface_coverage"
  | "correction_cta";

export type DocumentQualityFactor = {
  key: DocumentQualityFactorKey;
  label: string;
  score: number;
  max: number;
  summary: string;
  publicSafe: boolean;
};

export type DocumentQualityScore = {
  score: number;
  max: number;
  percentage: number;
  grade: "excellent" | "good" | "review" | "poor";
  summary: string;
  factors: DocumentQualityFactor[];
  publicFactors: DocumentQualityFactor[];
};

const UNKNOWN_VALUES = new Set(["확인 필요", "Needs verification", "needs verification", "unknown", "Unknown", ""]);
const FRESH_DAYS_DEFAULT = 180;
const SUPPORTED_LOCALES = ["ko", "en", "ja", "zh", "es", "hi", "ar"];

function clamp(value: number, max: number) {
  return Math.max(0, Math.min(max, Math.round(value)));
}

function ratio(count: number, total: number) {
  return total > 0 ? count / total : 0;
}

function ageInDays(value?: string | null) {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.floor((Date.now() - time) / 86_400_000));
}

function claimSources(claim: QualityClaim) {
  return claim.sources ?? claim.claim_sources ?? [];
}

function hasCorrectionCta(document: QualityDocument) {
  if (document.slug) return true;
  const data = document.data ?? {};
  return Boolean(data.correction_url || data.report_url || data.hallucination_report_url);
}

export function calculateDocumentQuality(document: QualityDocument, claims: QualityClaim[]): DocumentQualityScore {
  const claimCount = claims.length;
  const knownClaims = claims.filter((claim) => !UNKNOWN_VALUES.has(String(claim.claim_value ?? "").trim())).length;
  const sourcedClaims = claims.filter((claim) => claimSources(claim).length > 0).length;
  const richSources = claims.filter((claim) => claimSources(claim).some((source) => source.url || source.citation || source.title)).length;
  const verifiedClaims = claims.filter((claim) => claim.status === "verified").length;
  const lowConfidenceClaims = claims.filter((claim) => claim.confidence === "low").length;
  const ttl = document.freshness_ttl_days ?? FRESH_DAYS_DEFAULT;
  const newestVerified = [document.last_verified_at, ...claims.map((claim) => claim.last_verified_at)].filter(Boolean).sort().at(-1) ?? null;
  const daysOld = ageInDays(newestVerified ?? document.updated_at);
  const localizedTitleCount = Object.keys(document.localized_title ?? {}).filter((locale) => SUPPORTED_LOCALES.includes(locale)).length;
  const hasTranslationReview = ["source_language", "human_translated", "human_reviewed"].includes(String(document.translation_status ?? ""));

  const factors: DocumentQualityFactor[] = [
    {
      key: "claim_coverage",
      label: "Claim coverage",
      score: clamp(ratio(knownClaims, Math.max(claimCount, 1)) * 15, 15),
      max: 15,
      summary: claimCount === 0 ? "No claim rows are attached." : `${knownClaims}/${claimCount} claims have non-unknown values.`,
      publicSafe: true,
    },
    {
      key: "source_coverage",
      label: "Source coverage",
      score: clamp((ratio(sourcedClaims, Math.max(claimCount, 1)) * 16) + (ratio(richSources, Math.max(claimCount, 1)) * 4), 20),
      max: 20,
      summary: `${sourcedClaims}/${claimCount} claims have sources; ${richSources} include URL/citation/title surface.`,
      publicSafe: true,
    },
    {
      key: "verification_status",
      label: "Verification status",
      score: clamp((ratio(verifiedClaims, Math.max(claimCount, 1)) * 20) + (document.status === "verified" ? 5 : 0) - lowConfidenceClaims, 25),
      max: 25,
      summary: `${verifiedClaims}/${claimCount} claims verified; document status is ${document.status ?? "unknown"}.`,
      publicSafe: true,
    },
    {
      key: "freshness",
      label: "Freshness",
      score: daysOld === null ? 0 : clamp((1 - Math.min(daysOld, ttl) / ttl) * 15, 15),
      max: 15,
      summary: daysOld === null ? "No verification/update timestamp available." : `${daysOld} days since latest verification/update; TTL ${ttl} days.`,
      publicSafe: true,
    },
    {
      key: "i18n_coverage",
      label: "i18n coverage",
      score: clamp((document.lang ? 3 : 0) + Math.min(localizedTitleCount, 4) + (hasTranslationReview ? 3 : 0), 10),
      max: 10,
      summary: `${document.lang ?? "unknown"} document; ${localizedTitleCount} localized titles; translation status ${document.translation_status ?? "unknown"}.`,
      publicSafe: true,
    },
    {
      key: "citation_surface_coverage",
      label: "Citation surface coverage",
      score: clamp((document.slug ? 4 : 0) + (claimCount > 0 ? 3 : 0) + (richSources > 0 ? 3 : 0), 10),
      max: 10,
      summary: document.slug ? `Static/API/raw citation surfaces can be derived from slug ${document.slug}.` : "No stable slug available for citation surfaces.",
      publicSafe: true,
    },
    {
      key: "correction_cta",
      label: "Correction CTA",
      score: hasCorrectionCta(document) ? 5 : 0,
      max: 5,
      summary: hasCorrectionCta(document) ? "Correction/report CTA is available." : "No correction/report CTA detected.",
      publicSafe: true,
    },
  ];

  const score = factors.reduce((sum, factor) => sum + factor.score, 0);
  const max = factors.reduce((sum, factor) => sum + factor.max, 0);
  const percentage = max > 0 ? Math.round((score / max) * 100) : 0;
  const grade = percentage >= 85 ? "excellent" : percentage >= 70 ? "good" : percentage >= 50 ? "review" : "poor";

  return {
    score,
    max,
    percentage,
    grade,
    summary: `${percentage}/100 document quality (${grade})`,
    factors,
    publicFactors: factors.filter((factor) => factor.publicSafe),
  };
}
