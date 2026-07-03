#!/usr/bin/env node
import { normalizeLimit, parseArgs, requireServiceRoleClient, runJob, writeAuditEvent } from "../lib/cron-job-utils.mjs";

const HIGH_RISK_DOMAINS = new Set(["finance", "healthcare", "government", "travel"]);
const DOMAIN_REVERIFICATION_DAYS = {
  finance: 30,
  healthcare: 30,
  government: 45,
  travel: 45,
  transport: 60,
  commerce: 90,
  education: 120,
  real_estate: 120,
  food: 90,
  dining: 90,
  events: 90,
  venues: 90,
  technology: 120,
  genomics: 45,
  dna: 45,
  default: 180,
};
const RISK_TIER_REVERIFICATION_DAYS = { forbidden: 7, high: 30, medium: 90, low: 180 };
const UPDATE_FREQUENCY_TTL_DAYS = { realtime: 1, daily: 2, weekly: 7, monthly: 31, quarterly: 92, annual: 366, event_based: 180, static: 730, unknown: 180 };
const SOURCE_STATUS_WEIGHT = { failed: 1, warning: 0.55, unchecked: 0.25, passed: 0 };

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function ageInDays(iso) {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return null;
  return Math.max(0, Math.floor((Date.now() - parsed) / 86_400_000));
}

function normalizeDomain(value) {
  return String(value || "default").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "default";
}

function domainFor(claim) {
  const raw = claim.domain || claim.documents?.category || claim.category || "default";
  const domain = normalizeDomain(raw).split("_")[0];
  if (domain === "government" || domain === "gov") return "government";
  if (domain === "health" || domain === "medical") return "healthcare";
  if (domain === "real") return "real_estate";
  return domain;
}

function ttlFor(claim, domain) {
  const updateFrequency = claim.update_frequency || claim.documents?.update_frequency || "unknown";
  const updateFrequencyTtl = UPDATE_FREQUENCY_TTL_DAYS[updateFrequency] ?? UPDATE_FREQUENCY_TTL_DAYS.unknown;
  const domainTtl = DOMAIN_REVERIFICATION_DAYS[domain] ?? DOMAIN_REVERIFICATION_DAYS.default;
  const riskTtl = RISK_TIER_REVERIFICATION_DAYS[claim.risk_tier || claim.documents?.risk_tier || "low"] ?? RISK_TIER_REVERIFICATION_DAYS.low;
  return Math.min(updateFrequencyTtl, domainTtl, riskTtl);
}

function sourceHealthFor(sources) {
  if (!sources.length) return { source_count: 0, unhealthy_source_count: 0, source_health_score: 1, source_health_label: "missing_source" };
  const unhealthy = sources.filter((source) => ["failed", "warning", "unchecked"].includes(source.source_check_status));
  const statusPenalty = sources.reduce((sum, source) => sum + (SOURCE_STATUS_WEIGHT[source.source_check_status] ?? 0.25), 0) / sources.length;
  const trustPenalty = sources.reduce((sum, source) => sum + (100 - (source.source_trust_score ?? 0)) / 100, 0) / sources.length;
  const score = clamp(statusPenalty * 0.7 + trustPenalty * 0.3);
  return {
    source_count: sources.length,
    unhealthy_source_count: unhealthy.length,
    source_health_score: Number(score.toFixed(3)),
    source_health_label: score >= 0.75 ? "poor" : score >= 0.35 ? "mixed" : "healthy",
  };
}

function scoreClaim({ claim, domain, ttl_days, age_days, sourceHealth, readCount, reportCount, verificationEventCount }) {
  const riskTier = claim.risk_tier || claim.documents?.risk_tier || "low";
  const riskScore = { forbidden: 1, high: 0.85, medium: 0.45, low: 0.15 }[riskTier] ?? 0.25;
  const domainScore = HIGH_RISK_DOMAINS.has(domain) ? 1 : domain === "transport" || domain === "genomics" || domain === "dna" ? 0.65 : 0.25;
  const ageScore = age_days === null ? 1 : clamp(age_days / ttl_days);
  const readScore = clamp(Math.log10(readCount + 1) / 4);
  const reportScore = clamp(reportCount / 5);
  const verificationGapScore = verificationEventCount === 0 ? 0.35 : 0;
  const score = Math.round(100 * (
    ageScore * 0.32 +
    sourceHealth.source_health_score * 0.22 +
    riskScore * 0.18 +
    domainScore * 0.12 +
    readScore * 0.08 +
    reportScore * 0.06 +
    verificationGapScore * 0.02
  ));
  return Math.max(0, Math.min(100, score));
}

function groupBy(rows, key) {
  const map = new Map();
  for (const row of rows || []) {
    const value = row[key];
    if (!map.has(value)) map.set(value, []);
    map.get(value).push(row);
  }
  return map;
}

await runJob("find-stale-claims", async () => {
  const args = parseArgs();
  const limit = normalizeLimit(args.limit, 100, 1000);
  const supabase = requireServiceRoleClient();

  const { data, error } = await supabase
    .from("claims")
    .select("id,document_id,entity_id,field_path,status,confidence,last_verified_at,updated_at,update_frequency,risk_tier,country,documents(category,country,update_frequency,risk_tier)")
    .eq("status", "verified")
    .order("last_verified_at", { ascending: true, nullsFirst: true })
    .limit(Math.min(limit * 8, 5000));
  if (error) throw new Error(`Failed to read stale claims: ${error.message}`);

  const claims = data || [];
  const claimIds = claims.map((claim) => claim.id);
  const documentIds = [...new Set(claims.map((claim) => claim.document_id).filter(Boolean))];
  const entityIds = [...new Set(claims.map((claim) => claim.entity_id).filter(Boolean))];
  const since30d = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const [sourcesResult, verificationEventsResult, documentStatsResult, readEventsResult, documentReportsResult, entityReportsResult, hallucinationReportsResult] = await Promise.all([
    claimIds.length ? supabase.from("claim_sources").select("id,claim_id,source_check_status,source_trust_score,observed_at,created_at").in("claim_id", claimIds) : { data: [], error: null },
    claimIds.length ? supabase.from("verification_events").select("id,claim_id,created_at").in("claim_id", claimIds) : { data: [], error: null },
    documentIds.length ? supabase.from("document_stats").select("document_id,view_count,ai_citation_count,human_view_count,bot_view_count,ai_crawler_view_count,api_cite_count,citation_copy_count,report_submission_count").in("document_id", documentIds) : { data: [], error: null },
    documentIds.length ? supabase.from("document_read_events").select("document_id,event_type,actor_type,created_at").in("document_id", documentIds).gte("created_at", since30d).limit(10000) : { data: [], error: null },
    documentIds.length ? supabase.from("reports").select("id,document_id,entity_id,status,created_at").eq("status", "new").in("document_id", documentIds) : { data: [], error: null },
    entityIds.length ? supabase.from("reports").select("id,document_id,entity_id,status,created_at").eq("status", "new").in("entity_id", entityIds) : { data: [], error: null },
    claimIds.length ? supabase.from("hallucination_reports").select("id,claim_id,document_id,entity_id,status,created_at").eq("status", "new").in("claim_id", claimIds) : { data: [], error: null },
  ]);
  for (const [label, result] of Object.entries({ sourcesResult, verificationEventsResult, documentStatsResult, readEventsResult, documentReportsResult, entityReportsResult, hallucinationReportsResult })) {
    if (result.error) throw new Error(`Failed to read ${label}: ${result.error.message}`);
  }

  const sourcesByClaim = groupBy(sourcesResult.data, "claim_id");
  const eventsByClaim = groupBy(verificationEventsResult.data, "claim_id");
  const statsByDocument = new Map((documentStatsResult.data || []).map((row) => [row.document_id, row]));
  const readsByDocument = groupBy(readEventsResult.data, "document_id");
  const reports = [...(documentReportsResult.data || []), ...(entityReportsResult.data || [])];
  const hallucinationsByClaim = groupBy(hallucinationReportsResult.data, "claim_id");

  const staleClaims = claims
    .map((claim) => {
      const domain = domainFor(claim);
      const ttl_days = ttlFor(claim, domain);
      const age_days = ageInDays(claim.last_verified_at);
      const sourceHealth = sourceHealthFor(sourcesByClaim.get(claim.id) || []);
      const stats = statsByDocument.get(claim.document_id) || {};
      const recentReads = (readsByDocument.get(claim.document_id) || []).length;
      const read_frequency_30d = recentReads || Number(stats.view_count || 0) + Number(stats.ai_citation_count || 0) + Number(stats.citation_copy_count || 0);
      const report_count = reports.filter((report) => report.document_id === claim.document_id || report.entity_id === claim.entity_id).length + (hallucinationsByClaim.get(claim.id) || []).length + Number(stats.report_submission_count || 0);
      const verificationEventCount = (eventsByClaim.get(claim.id) || []).length;
      const reverification_priority_score = scoreClaim({ claim, domain, ttl_days, age_days, sourceHealth, readCount: read_frequency_30d, reportCount: report_count, verificationEventCount });
      return {
        id: claim.id,
        document_id: claim.document_id,
        entity_id: claim.entity_id,
        field_path: claim.field_path,
        status: claim.status,
        confidence: claim.confidence,
        domain,
        risk_tier: claim.risk_tier ?? claim.documents?.risk_tier ?? "low",
        last_verified_at: claim.last_verified_at,
        update_frequency: claim.update_frequency ?? claim.documents?.update_frequency ?? "unknown",
        ttl_days,
        age_days,
        ...sourceHealth,
        read_frequency_30d,
        report_count,
        verification_event_count: verificationEventCount,
        reverification_priority_score,
        stale_reason: !claim.last_verified_at ? `missing last_verified_at; TTL ${ttl_days} days` : `last verified ${age_days} days ago; TTL ${ttl_days} days`,
        queue_only_policy: "Score is advisory for admin review/digest only. It must not change verification status or claim_value.",
        review_policy: "Even high stale probability cannot change claim_value before source-backed human review creates/updates claim_sources and verification_events.",
        category: claim.documents?.category ?? null,
        country: claim.documents?.country ?? claim.country ?? "GLOBAL",
      };
    })
    .filter((claim) => claim.age_days === null || claim.age_days > claim.ttl_days || claim.source_health_score >= 0.75 || claim.report_count > 0)
    .sort((a, b) => b.reverification_priority_score - a.reverification_priority_score || (b.age_days ?? Infinity) - (a.age_days ?? Infinity))
    .slice(0, limit);

  const { data: adoptions, error: adoptionError } = await supabase
    .from("topic_adoptions")
    .select("id,contributor_id,contributor_hash,entity_id,document_id,category,country,notification_preference")
    .eq("active", true)
    .limit(5000);
  if (adoptionError) throw new Error(`Failed to read topic adoptions: ${adoptionError.message}`);

  const watchRows = [];
  for (const claim of staleClaims) {
    for (const adoption of adoptions || []) {
      const matchesDocument = adoption.document_id && adoption.document_id === claim.document_id;
      const matchesEntity = adoption.entity_id && adoption.entity_id === claim.entity_id;
      const matchesCategory = adoption.category && adoption.category === claim.category;
      const matchesCountry = adoption.country === "GLOBAL" || adoption.country === claim.country;
      if ((matchesDocument || matchesEntity || matchesCategory) && matchesCountry) {
        watchRows.push({
          topic_adoption_id: adoption.id,
          contributor_id: adoption.contributor_id,
          contributor_hash: adoption.contributor_hash,
          entity_id: claim.entity_id,
          document_id: claim.document_id,
          claim_id: claim.id,
          category: claim.category,
          country: claim.country,
          event_type: "source_update_needed",
          notification_preference: adoption.notification_preference,
          mission_status: "open",
          source_update_needed: true,
          mission_created_at: new Date().toISOString(),
        });
      }
    }
  }

  if (!args.dryRun && watchRows.length > 0) {
    const { error: insertError } = await supabase.from("watch_subscriptions").insert(watchRows);
    if (insertError) throw new Error(`Failed to create watch subscriptions: ${insertError.message}`);
  }

  await writeAuditEvent(supabase, {
    action: "cron.find_stale_claims",
    metadata: {
      priority_model: "rule_based_v1",
      feature_sources: ["claims", "claim_sources", "verification_events", "document_read_events", "document_stats", "reports", "hallucination_reports"],
      high_risk_domains: [...HIGH_RISK_DOMAINS],
      domain_reverification_days: DOMAIN_REVERIFICATION_DAYS,
      policy: "reverification_priority_score is advisory only for admin review queue/digest; it never mutates claims.status or claims.claim_value without source-backed human review.",
      scanned: claims.length,
      stale_claims: staleClaims,
      watch_missions: watchRows.length,
      admin_queue: "/admin/review stale claims",
    },
  }, { dryRun: args.dryRun });
  return { dryRun: args.dryRun, staleClaims: staleClaims.length, watchMissions: watchRows.length, queue: "/admin/review stale claims", scoring: "rule_based_v1" };
});
