#!/usr/bin/env node
import { normalizeLimit, parseArgs, runJob } from "../lib/cron-job-utils.mjs";

await runJob("check-source-health", async () => {
  const args = parseArgs();
  const limit = normalizeLimit(args.limit, 25, 100);
  const baseUrl = (process.env.APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  const secret = process.env.CRON_SECRET || "";
  if (!baseUrl) throw new Error("APP_URL or NEXT_PUBLIC_SITE_URL is required");
  if (secret.length < 32) throw new Error("CRON_SECRET must be configured with at least 32 characters");

  const response = await fetch(`${baseUrl}/api/cron/task5-freshness?limit=${limit}`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Task 5-E freshness route failed with HTTP ${response.status}`);
  return body;
});
