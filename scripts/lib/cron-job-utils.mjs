import { createClient } from "@supabase/supabase-js";

export function parseArgs(argv = process.argv.slice(2)) {
  const args = { dryRun: false };
  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg.startsWith("--limit=")) args.limit = Number(arg.slice("--limit=".length));
    else if (arg.startsWith("--days=")) args.days = Number(arg.slice("--days=".length));
    else if (arg.startsWith("--timeout-ms=")) args.timeoutMs = Number(arg.slice("--timeout-ms=".length));
  }
  return args;
}

export function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return { url, serviceRoleKey, anonKey };
}

export function requireServiceRoleClient() {
  const { url, serviceRoleKey, anonKey } = getSupabaseConfig();
  if (!url) throw new Error("SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL is required for cron jobs.");
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required. Cron jobs must not write with the public anon key.");
  if (anonKey && anonKey === serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY must differ from NEXT_PUBLIC_SUPABASE_ANON_KEY.");

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-for-ai-job": "true" } },
  });
}

export function normalizeLimit(value, fallback = 100, max = 1000) {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(Math.floor(value), max);
}

export function isoDaysAgo(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString();
}

export async function writeAuditEvent(supabase, { action, metadata }, { dryRun = false } = {}) {
  const safeMetadata = {
    ...metadata,
    dry_run: Boolean(dryRun),
    job_recorded_at: new Date().toISOString(),
  };

  if (dryRun) {
    console.log(`[dry-run] admin_audit_events insert skipped: ${action}`);
    console.log(JSON.stringify(safeMetadata, null, 2));
    return { dryRun: true };
  }

  const { error } = await supabase.from("admin_audit_events").insert({ action, metadata: safeMetadata });
  if (error) throw new Error(`Failed to write admin_audit_events for ${action}: ${error.message}`);
  return { dryRun: false };
}

export async function runJob(name, handler) {
  const startedAt = new Date().toISOString();
  try {
    console.log(`[${name}] started at ${startedAt}`);
    const result = await handler();
    console.log(`[${name}] completed`);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`[${name}] failed`);
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  }
}
