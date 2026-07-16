import { NextResponse } from "next/server";
import { getAvailableProviders, type AIProviderKey } from "@/lib/ai-providers";
import { supabaseAdmin } from "@/lib/admin-api";
import {
  runTask5ShadowDraftBatch,
  task5EmergencyDisabled,
  validTask5CronSecret,
} from "@/lib/task5-shadow-drafting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function suppliedCronSecret(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) return authorization.slice("Bearer ".length).trim();
  return request.headers.get("x-cron-secret")?.trim() ?? null;
}

export async function POST(request: Request) {
  if (!process.env.CRON_SECRET || process.env.CRON_SECRET.length < 32) {
    return NextResponse.json({ error: "cron_not_configured" }, { status: 503 });
  }
  if (!validTask5CronSecret(suppliedCronSecret(request))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (task5EmergencyDisabled()) {
    return NextResponse.json({ enabled: false, reason: "emergency_disabled" }, { headers: { "Cache-Control": "no-store" } });
  }

  let body: { limit?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    // An empty body is valid for scheduled calls.
  }
  const limit = body.limit === undefined ? 1 : body.limit;
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 5) {
    return NextResponse.json({ error: "invalid_limit" }, { status: 400 });
  }

  const searchProvider = (process.env.TASK5_SEARCH_PROVIDER ?? "perplexity") as AIProviderKey;
  const modelProvider = (process.env.TASK5_MODEL_PROVIDER ?? "gpt") as AIProviderKey;
  const available = new Set(getAvailableProviders());
  if (!available.has(searchProvider) || !available.has(modelProvider)) {
    return NextResponse.json({ error: "task5_providers_not_configured" }, { status: 503 });
  }

  const client = supabaseAdmin();
  if (!client) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  try {
    const result = await runTask5ShadowDraftBatch(client, { limit, searchProvider, modelProvider });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[task5-shadow-draft] run failed", {
      name: error instanceof Error ? error.name : "unknown",
    });
    return NextResponse.json({ error: "shadow_draft_run_failed" }, { status: 500 });
  }
}
