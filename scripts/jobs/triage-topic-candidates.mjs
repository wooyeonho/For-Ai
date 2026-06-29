#!/usr/bin/env node
import { normalizeLimit, parseArgs, requireServiceRoleClient, runJob, writeAuditEvent } from "../lib/cron-job-utils.mjs";

function triage(candidate) {
  const claims = Array.isArray(candidate.claims) ? candidate.claims : [];
  const missingClaims = claims.length === 0;
  const hasSourceHints = Array.isArray(candidate.source_hints) && candidate.source_hints.length > 0;
  const riskTier = candidate.risk_tier || "medium";
  const recommendedStatus = riskTier === "forbidden" || missingClaims ? "rejected" : "reviewing";
  return { id: candidate.id, slug: candidate.slug, risk_tier: riskTier, claims: claims.length, has_source_hints: hasSourceHints, recommended_status: recommendedStatus };
}

await runJob("triage-topic-candidates", async () => {
  const args = parseArgs();
  const limit = normalizeLimit(args.limit, 50, 500);
  const supabase = requireServiceRoleClient();
  const { data, error } = await supabase.from("topic_candidates").select("id,slug,risk_tier,claims,source_hints,created_at").eq("status", "new").order("created_at", { ascending: true }).limit(limit);
  if (error) throw new Error(`Failed to read topic_candidates: ${error.message}`);
  const triaged = (data || []).map(triage);
  const counts = triaged.reduce((acc, item) => ({ ...acc, [item.recommended_status]: (acc[item.recommended_status] || 0) + 1 }), {});
  await writeAuditEvent(supabase, { action: "cron.triage_topic_candidates", metadata: { limit, scanned: triaged.length, counts, candidates: triaged.slice(0, 25) } }, { dryRun: args.dryRun });
  return { dryRun: args.dryRun, scanned: triaged.length, counts };
});
