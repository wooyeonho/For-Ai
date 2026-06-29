#!/usr/bin/env node

/**
 * generate-admin-digest.mjs
 *
 * Collects a daily operations digest for the For-Ai admin review queue and
 * delivers it to configured operator channels. The job is intentionally
 * claim-level and review-focused: it never promotes facts, never invents
 * details, and treats every intake item as unverified until a human reviews it.
 *
 * Required DB env:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Delivery env:
 *   ADMIN_DIGEST_EMAIL   - operator email address to include in the job log
 *   SLACK_WEBHOOK_URL    - incoming Slack webhook URL
 *   DISCORD_WEBHOOK_URL  - incoming Discord webhook URL
 *
 * Note about email: this project currently defines only a recipient address,
 * not an SMTP/API transport. To avoid pretending that an email was sent, the
 * job records the email digest in admin_audit_events/job logs with a
 * delivery status of "not_configured". Add a mail-provider env later and wire
 * sendEmailDigest() to make this a real transport.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ADMIN_DIGEST_EMAIL = process.env.ADMIN_DIGEST_EMAIL ?? "";
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL ?? "";
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL ?? "";
const DIGEST_WINDOW_HOURS = Number(process.env.ADMIN_DIGEST_WINDOW_HOURS ?? 24);
const STALE_CLAIM_DAYS = Number(process.env.STALE_CLAIM_DAYS ?? 90);
const MAX_ITEMS = Number(process.env.ADMIN_DIGEST_MAX_ITEMS ?? 10);

const runId = `admin-digest-${new Date().toISOString()}`;
const windowStart = new Date(Date.now() - DIGEST_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
const staleBefore = new Date(Date.now() - STALE_CLAIM_DAYS * 24 * 60 * 60 * 1000).toISOString();

function requireEnv() {
  const missing = [];
  if (!SUPABASE_URL) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length > 0) throw new Error(`Missing required env: ${missing.join(", ")}`);
}

function makeSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function countRows(sb, table, apply = (q) => q) {
  const query = apply(sb.from(table).select("id", { count: "exact", head: true }));
  const { count, error } = await query;
  if (error) throw new Error(`${table} count failed: ${error.message}`);
  return count ?? 0;
}

async function listRows(sb, table, select, apply = (q) => q, limit = MAX_ITEMS) {
  const { data, error } = await apply(sb.from(table).select(select)).limit(limit);
  if (error) throw new Error(`${table} list failed: ${error.message}`);
  return data ?? [];
}

async function maybeCountRows(sb, table, apply = (q) => q) {
  try {
    return await countRows(sb, table, apply);
  } catch (error) {
    if (String(error.message ?? error).includes("does not exist")) return null;
    throw error;
  }
}

async function collectDigest(sb) {
  const [
    newTopicCandidates,
    newReports,
    newHallucinationReports,
    staleClaims,
    pendingReviewClaims,
    failedSourceChecks,
    adminActionsCount,
  ] = await Promise.all([
    countRows(sb, "topic_candidates", (q) => q.eq("status", "new").gte("created_at", windowStart)),
    countRows(sb, "reports", (q) => q.eq("status", "new").gte("created_at", windowStart)),
    countRows(sb, "hallucination_reports", (q) => q.eq("status", "new").gte("created_at", windowStart)),
    countRows(sb, "claims", (q) => q.or(`last_verified_at.is.null,last_verified_at.lt.${staleBefore}`).neq("status", "unknown")),
    countRows(sb, "claims", (q) => q.eq("status", "needs_review")),
    maybeCountRows(sb, "admin_audit_events", (q) => q.ilike("action", "%source%failed%").gte("created_at", windowStart)),
    countRows(sb, "admin_audit_events", (q) => q.gte("created_at", windowStart)),
  ]);

  const [
    topicItems,
    reportItems,
    hallucinationItems,
    staleClaimItems,
    pendingClaimItems,
    usageEvents,
    suspiciousContributorRows,
  ] = await Promise.all([
    listRows(sb, "topic_candidates", "id,title,slug,lang,country,category,risk_tier,created_at", (q) => q.eq("status", "new").gte("created_at", windowStart).order("created_at", { ascending: false })),
    listRows(sb, "reports", "id,document_id,entity_id,report_type,status,created_at", (q) => q.eq("status", "new").gte("created_at", windowStart).order("created_at", { ascending: false })),
    listRows(sb, "hallucination_reports", "id,document_id,entity_id,ai_service,status,created_at", (q) => q.eq("status", "new").gte("created_at", windowStart).order("created_at", { ascending: false })),
    listRows(sb, "claims", "id,document_id,entity_id,field_path,status,confidence,last_verified_at,updated_at", (q) => q.or(`last_verified_at.is.null,last_verified_at.lt.${staleBefore}`).neq("status", "unknown").order("last_verified_at", { ascending: true, nullsFirst: true })),
    listRows(sb, "claims", "id,document_id,entity_id,field_path,status,confidence,updated_at", (q) => q.eq("status", "needs_review").order("updated_at", { ascending: true })),
    collectApiUsage(sb),
    collectSuspiciousSubmissions(sb),
  ]);

  return {
    run_id: runId,
    generated_at: new Date().toISOString(),
    window_hours: DIGEST_WINDOW_HOURS,
    window_start: windowStart,
    stale_claim_days: STALE_CLAIM_DAYS,
    counts: {
      new_topic_candidates: newTopicCandidates,
      new_reports: newReports,
      new_hallucination_reports: newHallucinationReports,
      stale_claims: staleClaims,
      pending_review_claims: pendingReviewClaims,
      failed_source_checks: failedSourceChecks,
      suspicious_submissions: suspiciousContributorRows.length,
      admin_actions: adminActionsCount,
    },
    items: {
      new_topic_candidates: topicItems,
      new_reports: reportItems,
      new_hallucination_reports: hallucinationItems,
      stale_claims: staleClaimItems,
      pending_review_claims: pendingClaimItems,
      suspicious_submissions: suspiciousContributorRows,
    },
    api_usage_summary: usageEvents,
  };
}

async function collectApiUsage(sb) {
  const eventCount = await maybeCountRows(sb, "api_usage_events", (q) => q.gte("created_at", windowStart));
  if (eventCount === null) return { available: false, total_events: null, by_status_code: [], top_endpoints: [] };

  const rows = await listRows(sb, "api_usage_events", "endpoint,status_code,key_id,created_at", (q) => q.gte("created_at", windowStart).order("created_at", { ascending: false }), 1000);
  const byStatus = new Map();
  const byEndpoint = new Map();
  const keys = new Set();
  for (const row of rows) {
    byStatus.set(row.status_code ?? "unknown", (byStatus.get(row.status_code ?? "unknown") ?? 0) + 1);
    byEndpoint.set(row.endpoint, (byEndpoint.get(row.endpoint) ?? 0) + 1);
    if (row.key_id) keys.add(row.key_id);
  }
  return {
    available: true,
    total_events: eventCount,
    unique_keys: keys.size,
    by_status_code: [...byStatus.entries()].map(([status_code, count]) => ({ status_code, count })),
    top_endpoints: [...byEndpoint.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_ITEMS).map(([endpoint, count]) => ({ endpoint, count })),
  };
}

async function collectSuspiciousSubmissions(sb) {
  const tables = ["topic_candidates", "reports", "hallucination_reports", "edits", "topic_suggestions"];
  const counts = new Map();
  for (const table of tables) {
    const column = table === "topic_suggestions" ? "submitted_at" : "created_at";
    const rows = await listRows(sb, table, `id,contributor_hash,${column}`, (q) => q.not("contributor_hash", "is", null).gte(column, windowStart), 1000);
    for (const row of rows) {
      const key = row.contributor_hash;
      if (!counts.has(key)) counts.set(key, { contributor_hash: key, total: 0, tables: {} });
      const entry = counts.get(key);
      entry.total += 1;
      entry.tables[table] = (entry.tables[table] ?? 0) + 1;
    }
  }
  return [...counts.values()].filter((entry) => entry.total >= 5).sort((a, b) => b.total - a.total).slice(0, MAX_ITEMS);
}

function formatDigest(digest) {
  const c = digest.counts;
  return [
    `For-Ai Admin Digest (${digest.window_hours}h)`,
    `Run: ${digest.run_id}`,
    `Generated: ${digest.generated_at}`,
    "",
    "Counts:",
    `- New topic candidates: ${c.new_topic_candidates}`,
    `- New reports: ${c.new_reports}`,
    `- New hallucination reports: ${c.new_hallucination_reports}`,
    `- Stale claims: ${c.stale_claims}`,
    `- Pending review claims: ${c.pending_review_claims}`,
    `- Failed source checks: ${c.failed_source_checks ?? "not tracked"}`,
    `- Suspicious submissions: ${c.suspicious_submissions}`,
    `- API usage events: ${digest.api_usage_summary.total_events ?? "not tracked"}`,
    `- Admin actions: ${c.admin_actions}`,
  ].join("\n");
}

async function postJson(name, url, payload) {
  if (!url) return { target: name, status: "skipped", reason: "missing_url" };
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${name} webhook failed: HTTP ${response.status} ${body.slice(0, 300)}`);
  }
  return { target: name, status: "sent", http_status: response.status };
}

async function sendEmailDigest(digest, text) {
  if (!ADMIN_DIGEST_EMAIL) return { target: "email", status: "skipped", reason: "ADMIN_DIGEST_EMAIL not set" };
  console.log(JSON.stringify({ target: "email", to: ADMIN_DIGEST_EMAIL, status: "not_configured", subject: "For-Ai admin digest", text }));
  return { target: "email", status: "not_configured", reason: "no email transport env configured", to: ADMIN_DIGEST_EMAIL };
}

async function deliverDigest(digest) {
  const text = formatDigest(digest);
  const deliveries = [
    ["email", () => sendEmailDigest(digest, text)],
    ["slack", () => postJson("slack", SLACK_WEBHOOK_URL, { text })],
    ["discord", () => postJson("discord", DISCORD_WEBHOOK_URL, { content: text })],
  ];

  const results = [];
  for (const [target, deliver] of deliveries) {
    try {
      results.push(await deliver());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[admin-digest] ${target} delivery failed`, message);
      results.push({ target, status: "failed", error: message });
    }
  }
  return results;
}

async function audit(sb, action, metadata) {
  const { error } = await sb.from("admin_audit_events").insert({ action, metadata });
  if (error) console.error("[admin-digest] audit insert failed", error.message, { action, metadata });
}

async function main() {
  let sb = null;
  try {
    requireEnv();
    sb = makeSupabase();
    const digest = await collectDigest(sb);
    const delivery = await deliverDigest(digest);
    const failedDelivery = delivery.filter((result) => result.status === "failed");
    await audit(sb, "admin.digest.generated", {
      run_id: runId,
      counts: digest.counts,
      api_usage_summary: digest.api_usage_summary,
      delivery,
    });
    if (failedDelivery.length > 0) {
      await audit(sb, "admin.digest.delivery_failed", { run_id: runId, delivery: failedDelivery });
      process.exitCode = 1;
    }
    console.log(JSON.stringify({ ok: failedDelivery.length === 0, digest, delivery }, null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[admin-digest] failed", message);
    if (sb || (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)) {
      await audit(sb ?? makeSupabase(), "admin.digest.failed", { run_id: runId, error: message });
    }
    process.exitCode = 1;
  }
}

main();
