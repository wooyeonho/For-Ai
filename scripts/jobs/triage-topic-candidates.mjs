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

function triage(candidate) {
  const claims = Array.isArray(candidate.claims) ? candidate.claims : [];
  const missingClaims = claims.length === 0;
  const hasSourceHints = Array.isArray(candidate.source_hints) && candidate.source_hints.length > 0;
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
  };
}

await runJob("triage-topic-candidates", async () => {
  const args = parseArgs();
  const limit = normalizeLimit(args.limit, 50, 500);
  const supabase = requireServiceRoleClient();
  const { data, error } = await supabase
    .from("topic_candidates")
    .select("id,slug,category,subcategory,risk_tier,claims,source_hints,consensus_level,agreed_providers,created_at")
    .eq("status", "new")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`Failed to read topic_candidates: ${error.message}`);
  const triaged = (data || []).map(triage);
  const counts = triaged.reduce((acc, item) => ({ ...acc, [item.recommended_status]: (acc[item.recommended_status] || 0) + 1 }), {});
  await writeAuditEvent(supabase, { action: "cron.triage_topic_candidates", metadata: { limit, scanned: triaged.length, counts, candidates: triaged.slice(0, 25) } }, { dryRun: args.dryRun });
  return { dryRun: args.dryRun, scanned: triaged.length, counts };
});
