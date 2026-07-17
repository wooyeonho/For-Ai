import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/admin-api";
import { runNotificationOutboxBatch } from "@/lib/task5-notifications";
import {
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

function requestedLimit(request: Request): number | null {
  const raw = new URL(request.url).searchParams.get("limit");
  if (raw === null) return 25;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 && value <= 100 ? value : null;
}

async function handle(request: Request) {
  if (!process.env.CRON_SECRET || process.env.CRON_SECRET.length < 32) {
    return NextResponse.json({ error: "cron_not_configured" }, { status: 503 });
  }
  if (!validTask5CronSecret(suppliedCronSecret(request))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (task5EmergencyDisabled()) {
    return NextResponse.json(
      { enabled: false, reason: "emergency_disabled" },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const limit = requestedLimit(request);
  if (limit === null) return NextResponse.json({ error: "invalid_limit" }, { status: 400 });
  const client = supabaseAdmin();
  if (!client) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  try {
    const result = await runNotificationOutboxBatch(client, { limit });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[task5-notifications] run failed", {
      name: error instanceof Error ? error.name : "unknown",
    });
    return NextResponse.json({ error: "notification_worker_failed" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
