#!/usr/bin/env node
import { isoDaysAgo, normalizeLimit, parseArgs, requireServiceRoleClient, runJob, writeAuditEvent } from "../lib/cron-job-utils.mjs";

await runJob("find-stale-claims", async () => {
  const args = parseArgs();
  const days = Number.isFinite(args.days) ? Math.max(1, Math.floor(args.days)) : 90;
  const limit = normalizeLimit(args.limit, 100, 1000);
  const cutoff = isoDaysAgo(days);
  const supabase = requireServiceRoleClient();
  const { data, error } = await supabase.from("claims").select("id,document_id,entity_id,field_path,status,confidence,last_verified_at,updated_at").or(`last_verified_at.is.null,last_verified_at.lt.${cutoff}`).order("updated_at", { ascending: true }).limit(limit);
  if (error) throw new Error(`Failed to read stale claims: ${error.message}`);
  const staleClaims = (data || []).map((claim) => ({ id: claim.id, document_id: claim.document_id, entity_id: claim.entity_id, field_path: claim.field_path, status: claim.status, confidence: claim.confidence, last_verified_at: claim.last_verified_at }));
  await writeAuditEvent(supabase, { action: "cron.find_stale_claims", metadata: { days, cutoff, scanned: staleClaims.length, stale_claims: staleClaims } }, { dryRun: args.dryRun });
  return { dryRun: args.dryRun, days, cutoff, staleClaims: staleClaims.length };
});
