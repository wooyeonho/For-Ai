#!/usr/bin/env node
import { normalizeLimit, parseArgs, requireServiceRoleClient, runJob, writeAuditEvent } from "../lib/cron-job-utils.mjs";

async function checkUrl(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { method: "HEAD", redirect: "follow", signal: controller.signal });
    return { ok: response.ok, status: response.status };
  } catch (error) {
    return { ok: false, status: "error", error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timeout);
  }
}

await runJob("check-source-health", async () => {
  const args = parseArgs();
  const limit = normalizeLimit(args.limit, 50, 200);
  const timeoutMs = normalizeLimit(args.timeoutMs, 8000, 30000);
  const supabase = requireServiceRoleClient();
  const { data, error } = await supabase.from("claim_sources").select("id,claim_id,url,source_type,created_at").not("url", "is", null).order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`Failed to read claim_sources: ${error.message}`);
  const checks = [];
  for (const source of data || []) {
    const health = await checkUrl(source.url, timeoutMs);
    checks.push({ id: source.id, claim_id: source.claim_id, url: source.url, source_type: source.source_type, ...health });
  }
  // This job records reachability only. Source trust classifier labels, when shown elsewhere
  // as recommended source type, are review hints and must not promote candidates,
  // create verification_events, or change claim confidence/status automatically.
  const unhealthy = checks.filter((check) => !check.ok);
  await writeAuditEvent(supabase, { action: "cron.check_source_health", metadata: { limit, timeout_ms: timeoutMs, checked: checks.length, unhealthy_count: unhealthy.length, unhealthy: unhealthy.slice(0, 50) } }, { dryRun: args.dryRun });
  return { dryRun: args.dryRun, checked: checks.length, unhealthy: unhealthy.length };
});
