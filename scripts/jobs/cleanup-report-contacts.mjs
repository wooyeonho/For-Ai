#!/usr/bin/env node
import {
  parseArgs,
  requireServiceRoleClient,
  runJob,
  writeAuditEvent,
} from "../lib/cron-job-utils.mjs";

await runJob("cleanup-report-contacts", async () => {
  const args = parseArgs();
  const supabase = requireServiceRoleClient();
  let expiredCount = 0;

  if (args.dryRun) {
    const { count, error } = await supabase
      .from("reports")
      .select("id", { count: "exact", head: true })
      .not("reporter_contact", "is", null)
      .lte("private_contact_expires_at", new Date().toISOString());
    if (error) throw new Error(`Failed to count expired report contacts: ${error.message}`);
    expiredCount = count ?? 0;
  } else {
    const { data, error } = await supabase.rpc("cleanup_expired_report_contacts");
    if (error) throw new Error(`Failed to clean expired report contacts: ${error.message}`);
    expiredCount = Number(data ?? 0);
  }

  await writeAuditEvent(supabase, {
    action: "cron.cleanup_report_contacts",
    metadata: { expired_contact_count: expiredCount },
  }, { dryRun: args.dryRun });

  return { dryRun: args.dryRun, expiredContactCount: expiredCount };
});
