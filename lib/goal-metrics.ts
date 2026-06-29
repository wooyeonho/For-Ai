import fs from "fs";
import path from "path";
import { getAllRegistryBundles, isVerifiedDocumentBundle } from "./data";

export type GoalMetric = { label: string; value: string | number; detail: string };
export type GoalMetrics = {
  generatedQuestionCandidates: number;
  longTailTopicCandidates: number;
  verifiedSeedTopics: number;
  candidateClaims: number;
  needsReviewClaims: number;
  verifiedClaims: number;
  citationReadyClaims: number;
  highRiskCandidates: number;
  medicalCandidates: number;
  realtimeCandidates: number;
};

export type CampaignTopCategory = { label: string; count: number };
export type OneMillionFactsCampaignMetrics = {
  totalFacts: number;
  verifiedFacts: number;
  countriesCovered: number;
  countryCodes: string[];
  topCategories: CampaignTopCategory[];
  progressPercent: number;
  remainingFacts: number;
};

const ONE_MILLION_FACTS_GOAL = 1_000_000;

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

export function getGoalMetrics(): GoalMetrics {
  const bundles = getAllRegistryBundles();
  const claims = bundles.flatMap((bundle) => bundle.claims);
  const verifiedClaims = claims.filter((claim) => claim.status === "verified" && claim.claim_value !== "확인 필요").length;
  const citationReadyClaims = bundles
    .filter(isVerifiedDocumentBundle)
    .flatMap((bundle) => bundle.claims)
    .filter((claim) => claim.status === "verified" && claim.sources.length > 0 && claim.last_verified_at).length;

  const candidateFiles = ["data/question-candidates/one-click-sample.jsonl", "data/topic-candidates/long-tail-combination-sample.jsonl"];
  const highRiskCandidates = candidateFiles.reduce((sum, file) => sum + scanJsonl(file, (row) => row.risk_tier === "high"), 0);
  const medicalCandidates = candidateFiles.reduce((sum, file) => sum + scanJsonl(file, (row) => String(row.type ?? row.category ?? "").includes("medical") || String(row.type ?? row.category ?? "").includes("health") || String(row.type ?? row.category ?? "").includes("radiology")), 0);
  const realtimeCandidates = candidateFiles.reduce((sum, file) => sum + scanJsonl(file, (row) => ["realtime", "daily", "monthly", "annual"].includes(String(row.update_frequency ?? ""))), 0);

  return {
    generatedQuestionCandidates: countJsonl("data/question-candidates/one-click-sample.jsonl"),
    longTailTopicCandidates: countJsonl("data/topic-candidates/long-tail-combination-sample.jsonl"),
    verifiedSeedTopics: countJsonArray("data/verified-seed-set.json"),
    candidateClaims: claims.length,
    needsReviewClaims: claims.filter((claim) => claim.status !== "verified" || claim.claim_value === "확인 필요").length,
    verifiedClaims,
    citationReadyClaims,
    highRiskCandidates,
    medicalCandidates,
    realtimeCandidates,
  };
}

export function getTrustReadiness(): GoalMetric[] {
  const m = getGoalMetrics();
  return [
    { label: "Citation-ready claims", value: m.citationReadyClaims, detail: "verified + source-backed + last_verified_at present" },
    { label: "Needs-review claims", value: m.needsReviewClaims, detail: "must show 확인 필요 / low until reviewed" },
    { label: "High-risk candidates", value: m.highRiskCandidates, detail: "medical/legal/finance/realtime candidates require source review" },
    { label: "Generated queues", value: m.generatedQuestionCandidates + m.longTailTopicCandidates, detail: "candidate inventory, not published truth" },
  ];
}

export function getOneMillionFactsCampaignMetrics(): OneMillionFactsCampaignMetrics {
  const bundles = getAllRegistryBundles();
  const claims = bundles.flatMap((bundle) => bundle.claims);
  const verifiedFacts = claims.filter((claim) => claim.status === "verified" && claim.claim_value !== "확인 필요").length;
  const countryCodes = Array.from(
    new Set(bundles.map((bundle) => bundle.document.country).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b, "en"));

  const categoryCounts = bundles.reduce((counts, bundle) => {
    const category = bundle.document.category || "uncategorized";
    counts.set(category, (counts.get(category) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());

  const topCategories = Array.from(categoryCounts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "en"))
    .slice(0, 8);

  const totalFacts = claims.length;

  return {
    totalFacts,
    verifiedFacts,
    countriesCovered: countryCodes.length,
    countryCodes,
    topCategories,
    progressPercent: Math.min(100, Number(((totalFacts / ONE_MILLION_FACTS_GOAL) * 100).toFixed(3))),
    remainingFacts: Math.max(0, ONE_MILLION_FACTS_GOAL - totalFacts),
  };
}
