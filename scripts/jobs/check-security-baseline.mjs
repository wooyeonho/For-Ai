#!/usr/bin/env node
import { getSupabaseConfig, parseArgs, requireServiceRoleClient, runJob, writeAuditEvent } from "../lib/cron-job-utils.mjs";

await runJob("check-security-baseline", async () => {
  const args = parseArgs();
  const config = getSupabaseConfig();
  const checks = [
    { name: "supabase_url_present", ok: Boolean(config.url) },
    { name: "service_role_key_present", ok: Boolean(config.serviceRoleKey) },
    { name: "anon_key_present", ok: Boolean(config.anonKey) },
    { name: "service_role_differs_from_anon", ok: Boolean(config.serviceRoleKey && config.anonKey && config.serviceRoleKey !== config.anonKey) },
    { name: "admin_secret_present", ok: Boolean(process.env.ADMIN_SECRET) },
    { name: "admin_csrf_secret_present", ok: Boolean(process.env.ADMIN_CSRF_SECRET) },
    { name: "contributor_salt_present", ok: Boolean(process.env.CONTRIBUTOR_SALT) },
  ];
  const supabase = requireServiceRoleClient();
  const failed = checks.filter((check) => !check.ok);
  await writeAuditEvent(supabase, { action: "cron.check_security_baseline", metadata: { checks, failed_count: failed.length } }, { dryRun: args.dryRun });
  if (failed.length) throw new Error(`Security baseline failed: ${failed.map((check) => check.name).join(", ")}`);
  return { dryRun: args.dryRun, checks };
});
