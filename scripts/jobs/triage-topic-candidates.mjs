#!/usr/bin/env node
import { normalizeLimit, parseArgs, requireServiceRoleClient, runJob, writeAuditEvent } from "../lib/cron-job-utils.mjs";

const HIGH_RISK_DOMAINS = new Set([
  "finance",
  "government",
  "healthcare",
  "genomics",
  "dna",
  "legal",
  "real_estate",
  "travel",
]);

const PLACEHOLDER_VALUES = new Set(["확인 필요", "Needs verification"]);

const REVIEW_PRIORITY_MODEL_VERSION = "rule-based-v1";

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasOnlyPlaceholderClaims(claims) {
  return claims.every((claim) => PLACEHOLDER_VALUES.has(claim?.placeholder_value));
}

function isHighRiskDomain(candidate) {
  const riskTier = candidate.risk_tier || "medium";
  const category = String(candidate.category || "").toLowerCase();
  const subcategory = String(candidate.subcategory || "").toLowerCase();
  return riskTier === "high" || HIGH_RISK_DOMAINS.has(category) || HIGH_RISK_DOMAINS.has(subcategory);
}

function isSingleProviderCandidate(candidate) {
  const providers = Array.isArray(candidate.agreed_providers) ? candidate.agreed_providers : [];
  return candidate.consensus_level === "single" || providers.length <= 1;
}

function scoreSourcePresence(candidate) {
  const sourceHints = normalizeArray(candidate.source_hints);
  if (sourceHints.length === 0) return { score: 20, reason: "no source hints" };
  const hasOfficialishSource = sourceHints.some((source) => {
    const authority = source?.source_authority || source?.authority || source?.type;
    return ["primary", "official", "regulator", "legal", "platform"].includes(authority);
  });
  if (hasOfficialishSource) return { score: 6, reason: "official/primary source hints present" };
  return { score: 12, reason: "non-authoritative source hints present" };
}

function scoreRiskTier(candidate) {
  const scores = { low: 4, medium: 12, high: 24, forbidden: 36 };
  const riskTier = candidate.risk_tier || "medium";
  return { score: scores[riskTier] ?? scores.medium, reason: `risk tier ${riskTier}` };
}

function scoreDomainVolatility(candidate) {
  const scores = { realtime: 18, daily: 16, weekly: 13, monthly: 10, quarterly: 7, annual: 5, event_based: 9, static: 2 };
  const updateFrequency = candidate.update_frequency || "event_based";
  return { score: scores[updateFrequency] ?? scores.event_based, reason: `domain volatility ${updateFrequency}` };
}

function scoreConsensusLevel(candidate) {
  const scores = { unanimous: 2, majority: 7, minority: 15, single: 18 };
  const consensusLevel = candidate.consensus_level || (Number(candidate.consensus_score) >= 0.8 ? "majority" : "single");
  return { score: scores[consensusLevel] ?? scores.single, reason: `consensus ${consensusLevel}` };
}

function scoreUserDemandSignal(candidate) {
  const signals = [candidate.why_people_ask_ai, candidate.why_ai_gets_wrong].filter(hasText).length;
  if (candidate.source === "user_suggested") return { score: 12, reason: "user suggested topic" };
  if (signals >= 2) return { score: 8, reason: "AI-question demand rationale present" };
  if (signals === 1) return { score: 4, reason: "partial demand rationale present" };
  return { score: 0, reason: "no user demand signal" };
}

const ruleBasedReviewPriorityScorer = {
  version: REVIEW_PRIORITY_MODEL_VERSION,
  score(candidate) {
    const parts = [
      scoreSourcePresence(candidate),
      scoreRiskTier(candidate),
      scoreDomainVolatility(candidate),
      scoreConsensusLevel(candidate),
      scoreUserDemandSignal(candidate),
    ];
    const score = clampScore(parts.reduce((sum, part) => sum + part.score, 0));
    return {
      review_priority_score: score,
      review_priority_reason: parts.map((part) => `${part.reason}: +${part.score}`).join("; "),
      model_version: this.version,
    };
  },
};

// Scoring is intentionally behind this interface so future deep-learning models
// can replace ruleBasedReviewPriorityScorer without touching canonical truth.
// Scores are review-queue helpers only and must not directly mutate claim
// confidence, verification status, claim_sources, or verification_events.
function getReviewPriorityScorer() {
  return ruleBasedReviewPriorityScorer;
}

function triage(candidate, scorer = getReviewPriorityScorer()) {
  const claims = normalizeArray(candidate.claims);
  const missingClaims = claims.length === 0;
  const hasSourceHints = normalizeArray(candidate.source_hints).length > 0;
  const riskTier = candidate.risk_tier || "medium";
  const highRiskDomain = isHighRiskDomain(candidate);
  const singleProviderCandidate = isSingleProviderCandidate(candidate);
  const placeholderOnly = hasOnlyPlaceholderClaims(claims);
  const rejectionReasons = [];
  const reviewReasons = [];

  if (riskTier === "forbidden") rejectionReasons.push("forbidden-risk-tier");
  if (missingClaims) rejectionReasons.push("missing-claims");
  if (!placeholderOnly) rejectionReasons.push("non-placeholder-claim-value");

  if (!hasSourceHints) reviewReasons.push("source-hint-missing");
  if (highRiskDomain) reviewReasons.push("high-risk-domain");
  if (singleProviderCandidate) reviewReasons.push("single-provider-candidate");

  const recommendedStatus = rejectionReasons.length > 0 ? "rejected" : "reviewing";

  return {
    id: candidate.id,
    slug: candidate.slug,
    risk_tier: riskTier,
    category: candidate.category || null,
    claims: claims.length,
    has_source_hints: hasSourceHints,
    consensus_level: candidate.consensus_level || null,
    agreed_provider_count: Array.isArray(candidate.agreed_providers) ? candidate.agreed_providers.length : 0,
    high_risk_domain: highRiskDomain,
    recommended_status: recommendedStatus,
    rejection_reasons: rejectionReasons,
    review_reasons: reviewReasons,
    ...scorer.score(candidate),
  };
}

await runJob("triage-topic-candidates", async () => {
  const args = parseArgs();
  const limit = normalizeLimit(args.limit, 50, 500);
  const supabase = requireServiceRoleClient();
  const selectColumns = "id,slug,category,subcategory,source,risk_tier,update_frequency,claims,source_hints,consensus_score,consensus_level,agreed_providers,why_people_ask_ai,why_ai_gets_wrong,created_at";
  const { data, error } = await supabase.from("topic_candidates").select(selectColumns).eq("status", "new").order("created_at", { ascending: true }).limit(limit);
  if (error) throw new Error(`Failed to read topic_candidates: ${error.message}`);

  const triaged = (data || []).map((candidate) => triage(candidate));
  const counts = triaged.reduce((acc, item) => ({ ...acc, [item.recommended_status]: (acc[item.recommended_status] || 0) + 1 }), {});

  if (!args.dryRun && triaged.length > 0) {
    const updates = triaged.map((item) =>
      supabase
        .from("topic_candidates")
        .update({
          review_priority_score: item.review_priority_score,
          review_priority_reason: item.review_priority_reason,
          model_version: item.model_version,
        })
        .eq("id", item.id),
    );
    const results = await Promise.all(updates);
    const failed = results.find((result) => result.error);
    if (failed) throw new Error(`Failed to update topic_candidates review priority: ${failed.error.message}`);
  }

  await writeAuditEvent(
    supabase,
    {
      action: "cron.triage_topic_candidates",
      metadata: {
        limit,
        scanned: triaged.length,
        counts,
        model_version: REVIEW_PRIORITY_MODEL_VERSION,
        scoring_policy: "Auxiliary review queue only; never mutates claim confidence or verification status.",
        candidates: triaged.slice(0, 25),
      },
    },
    { dryRun: args.dryRun },
  );
  return { dryRun: args.dryRun, scanned: triaged.length, counts, model_version: REVIEW_PRIORITY_MODEL_VERSION };
});
