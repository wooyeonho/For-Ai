import fs from "fs";
import path from "path";
import { getClaimCitationStatus, isStale } from "./citation-status";
import { getAllRegistryBundles } from "./data";

export type GoalMetric = { label: string; value: string | number; detail: string };
export type CountBucket = { key: string; count: number };
export type CoverageMetrics = {
  totalDocuments: number;
  totalClaims: number;
  verifiedClaims: number;
  staleClaims: number;
  documentsByVertical: CountBucket[];
  documentsByCountry: CountBucket[];
  verifiedClaimsLast7Days: number;
  verifiedClaimsLast30Days: number;
  citationReadyClaims: number;
  citationReadyRatio: number;
  citationReadyPercentage: number;
  generatedAt: string;
};
export type GoalMetrics = CoverageMetrics & {
  generatedQuestionCandidates: number;
  longTailTopicCandidates: number;
  verifiedSeedTopics: number;
  candidateClaims: number;
  needsReviewClaims: number;
  highRiskCandidates: number;
  medicalCandidates: number;
  realtimeCandidates: number;
};

function countJsonl(relativePath: string): number {
  try {
    const file = fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
    return file.split(/\r?\n/).filter((line) => line.trim()).length;
  } catch { return 0; }
}

function countJsonArray(relativePath: string): number {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(process.cwd(), relativePath), "utf8"));
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch { return 0; }
}

function scanJsonl(relativePath: string, test: (row: Record<string, unknown>) => boolean): number {
  try {
    return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .reduce((count, line) => {
        try { return count + (test(JSON.parse(line)) ? 1 : 0); } catch { return count; }
      }, 0);
  } catch { return 0; }
}

function daysSince(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) return null;
  return Math.floor((now.getTime() - timestamp) / 86_400_000);
}

function bucketCounts(values: string[]): CountBucket[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = value.trim() || "unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export function getCoverageMetrics(now: Date = new Date()): CoverageMetrics {
  const bundles = getAllRegistryBundles();
  const claims = bundles.flatMap((bundle) => bundle.claims);
  const verifiedClaims = claims.filter((claim) => claim.status === "verified" && claim.claim_value !== "확인 필요");
  const citationReadyClaims = claims.filter((claim) => getClaimCitationStatus(claim).isCitationReady);
  const verifiedWithinDays = (days: number) => verifiedClaims.filter((claim) => {
    const age = daysSince(claim.last_verified_at, now);
    return age !== null && age >= 0 && age <= days;
  }).length;

  return {
    totalDocuments: bundles.length,
    totalClaims: claims.length,
    verifiedClaims: verifiedClaims.length,
    staleClaims: verifiedClaims.filter((claim) => isStale(claim.last_verified_at, undefined, now)).length,
    documentsByVertical: bucketCounts(bundles.map((bundle) => bundle.entity.type || bundle.document.category || "unknown")),
    documentsByCountry: bucketCounts(bundles.map((bundle) => bundle.document.country || bundle.entity.country || "unknown")),
    verifiedClaimsLast7Days: verifiedWithinDays(7),
    verifiedClaimsLast30Days: verifiedWithinDays(30),
    citationReadyClaims: citationReadyClaims.length,
    citationReadyRatio: claims.length ? citationReadyClaims.length / claims.length : 0,
    citationReadyPercentage: claims.length ? Math.round((citationReadyClaims.length / claims.length) * 100) : 0,
    generatedAt: now.toISOString(),
  };
}

export function getGoalMetrics(): GoalMetrics {
  const coverage = getCoverageMetrics();
  const bundles = getAllRegistryBundles();
  const claims = bundles.flatMap((bundle) => bundle.claims);

  const candidateFiles = ["data/question-candidates/one-click-sample.jsonl", "data/topic-candidates/long-tail-combination-sample.jsonl"];
  const highRiskCandidates = candidateFiles.reduce((sum, file) => sum + scanJsonl(file, (row) => row.risk_tier === "high"), 0);
  const medicalCandidates = candidateFiles.reduce((sum, file) => sum + scanJsonl(file, (row) => String(row.type ?? row.category ?? "").includes("medical") || String(row.type ?? row.category ?? "").includes("health") || String(row.type ?? row.category ?? "").includes("radiology")), 0);
  const realtimeCandidates = candidateFiles.reduce((sum, file) => sum + scanJsonl(file, (row) => ["realtime", "daily", "monthly", "annual"].includes(String(row.update_frequency ?? ""))), 0);

  return {
    ...coverage,
    generatedQuestionCandidates: countJsonl("data/question-candidates/one-click-sample.jsonl"),
    longTailTopicCandidates: countJsonl("data/topic-candidates/long-tail-combination-sample.jsonl"),
    verifiedSeedTopics: countJsonArray("data/verified-seed-set.json"),
    candidateClaims: claims.length,
    needsReviewClaims: claims.filter((claim) => claim.status !== "verified" || claim.claim_value === "확인 필요").length,
    highRiskCandidates,
    medicalCandidates,
    realtimeCandidates,
  };
}

export function getTrustReadiness(): GoalMetric[] {
  const m = getGoalMetrics();
  return [
    { label: "Citation-ready claims", value: m.citationReadyClaims, detail: "verified + source-backed + last_verified_at present" },
    { label: "Citation-ready ratio", value: `${m.citationReadyPercentage}%`, detail: `${m.citationReadyClaims}/${m.totalClaims} total claims are citation-ready` },
    { label: "Needs-review claims", value: m.needsReviewClaims, detail: "must show 확인 필요 / low until reviewed" },
    { label: "High-risk candidates", value: m.highRiskCandidates, detail: "medical/legal/finance/realtime candidates require source review" },
    { label: "Generated queues", value: m.generatedQuestionCandidates + m.longTailTopicCandidates, detail: "candidate inventory, not published truth" },
  ];
}
