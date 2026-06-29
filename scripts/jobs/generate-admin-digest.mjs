#!/usr/bin/env node
import { isoDaysAgo, parseArgs, requireServiceRoleClient, runJob, writeAuditEvent } from "../lib/cron-job-utils.mjs";

async function count(supabase, table, filter) {
  let query = supabase.from(table).select("*", { count: "exact", head: true });
  if (filter) query = filter(query);
  const { count: total, error } = await query;
  if (error) throw new Error(`Failed to count ${table}: ${error.message}`);
  return total || 0;
}

await runJob("generate-admin-digest", async () => {
  const args = parseArgs();
  const days = Number.isFinite(args.days) ? Math.max(1, Math.floor(args.days)) : 1;
  const since = isoDaysAgo(days);
  const supabase = requireServiceRoleClient();
  const digest = {
    window_days: days,
    since,
    topic_candidates_new: await count(supabase, "topic_candidates", (q) => q.eq("status", "new")),
    edits_new: await count(supabase, "edits", (q) => q.eq("status", "new")),
    reports_new: await count(supabase, "reports", (q) => q.eq("status", "new")),
    hallucination_reports_new: await count(supabase, "hallucination_reports", (q) => q.eq("status", "new")),
    claims_verified_recently: await count(supabase, "claims", (q) => q.eq("status", "verified").gte("last_verified_at", since)),
    audit_events_recent: await count(supabase, "admin_audit_events", (q) => q.gte("created_at", since)),
  };
  await writeAuditEvent(supabase, { action: "cron.generate_admin_digest", metadata: digest }, { dryRun: args.dryRun });
  return { dryRun: args.dryRun, digest };
});
