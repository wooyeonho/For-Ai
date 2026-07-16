#!/usr/bin/env node
import { requireServiceRoleClient, runJob, writeAuditEvent } from "../lib/cron-job-utils.mjs";

// Bible v7 Task 5-A: wanted_claim_demand_signals rows carry an 8-day
// expires_at (see supabase/migrations/20260717090000_task5_a_demand_signals.sql).
// wanted_claim_suggesters is never touched here -- suggesters are retained.
await runJob("cleanup-wanted-claim-signals", async () => {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const supabase = requireServiceRoleClient();

  if (dryRun) {
    const { count, error } = await supabase
      .from("wanted_claim_demand_signals")
      .select("id", { count: "exact", head: true })
      .lte("expires_at", new Date().toISOString());
    if (error) throw new Error(`Failed to count expired signals: ${error.message}`);
    await writeAuditEvent(supabase, { action: "cron.cleanup_wanted_claim_signals", metadata: { would_delete: count ?? 0 } }, { dryRun: true });
    return { dryRun: true, wouldDelete: count ?? 0 };
  }

  const { data, error } = await supabase.rpc("cleanup_wanted_claim_signals");
  if (error) throw new Error(`cleanup_wanted_claim_signals RPC failed: ${error.message}`);
  await writeAuditEvent(supabase, { action: "cron.cleanup_wanted_claim_signals", metadata: { deleted: data } }, { dryRun: false });
  return { dryRun: false, deleted: data };
});
