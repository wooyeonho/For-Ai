import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/admin-api";
import { runEvidenceFreshnessBatch } from "@/lib/task5-freshness";
import { task5EmergencyDisabled, validTask5CronSecret } from "@/lib/task5-shadow-drafting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function suppliedSecret(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) return authorization.slice(7).trim();
  return request.headers.get("x-cron-secret")?.trim() ?? null;
}

async function handle(request: Request) {
  if (!process.env.CRON_SECRET || process.env.CRON_SECRET.length < 32) {
    return NextResponse.json({ error: "cron_not_configured" }, { status: 503 });
  }
  if (!validTask5CronSecret(suppliedSecret(request))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (task5EmergencyDisabled()) {
    return NextResponse.json({ enabled: false, reason: "emergency_disabled" }, { headers: { "Cache-Control": "no-store" } });
  }

  const rawLimit = new URL(request.url).searchParams.get("limit");
  const limit = rawLimit === null ? 25 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return NextResponse.json({ error: "invalid_limit" }, { status: 400 });
  }

  const client = supabaseAdmin();
  if (!client) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });
  try {
    const result = await runEvidenceFreshnessBatch(client, { limit });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[task5-freshness] run failed", { name: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: "freshness_worker_failed" }, { status: 500 });
  }
}

export async function GET(request: Request) { return handle(request); }
export async function POST(request: Request) { return handle(request); }
