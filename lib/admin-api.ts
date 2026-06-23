import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const ADMIN_SECRET = process.env.ADMIN_SECRET ?? "";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const RATE_LIMIT_WINDOW_MS = 60_000;
const READ_LIMIT = 120;
const MUTATION_LIMIT = 30;

type RateBucket = { count: number; resetAt: number };
const buckets = new Map<string, RateBucket>();

export type AdminActionType =
  | "candidate_status_updated"
  | "candidates_generated"
  | "candidate_promoted"
  | "claim_verified";

export function missingSupabaseAdminEnv(): string[] {
  return [
    ...(!SUPABASE_URL ? ["NEXT_PUBLIC_SUPABASE_URL"] : []),
    ...(!SUPABASE_SERVICE_ROLE_KEY ? ["SUPABASE_SERVICE_ROLE_KEY"] : []),
  ];
}

export function supabaseAdmin() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

export function authorized(request: Request): boolean {
  const auth = request.headers.get("x-admin-secret");
  return !ADMIN_SECRET || auth === ADMIN_SECRET;
}

function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const secret = request.headers.get("x-admin-secret") ?? "no-secret";
  return `${forwarded ?? realIp ?? "unknown"}:${secret.slice(0, 8)}`;
}

export function enforceAdminRateLimit(request: Request, limit = MUTATION_LIMIT): NextResponse | null {
  const now = Date.now();
  const key = `${request.method}:${new URL(request.url).pathname}:${clientKey(request)}`;
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return null;
  }
  bucket.count += 1;
  if (bucket.count <= limit) return null;
  return NextResponse.json(
    { error: "rate_limited", retry_after_seconds: Math.ceil((bucket.resetAt - now) / 1000) },
    { status: 429, headers: { "Retry-After": String(Math.ceil((bucket.resetAt - now) / 1000)) } }
  );
}

export function enforceAdminReadRateLimit(request: Request): NextResponse | null {
  return enforceAdminRateLimit(request, READ_LIMIT);
}

export function enforceAdminCsrf(request: Request): NextResponse | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  const requestOrigin = new URL(request.url).origin;
  if (origin === requestOrigin) return null;
  return NextResponse.json({ error: "csrf_origin_mismatch" }, { status: 403 });
}

export async function recordAdminAuditEvent(
  sb: SupabaseClient,
  params: {
    actionType: AdminActionType;
    targetTable: string;
    targetId: string;
    previousState?: unknown;
    newState?: unknown;
    request: Request;
  }
): Promise<void> {
  const { error } = await sb.from("admin_audit_events").insert({
    action_type: params.actionType,
    target_table: params.targetTable,
    target_id: params.targetId,
    previous_state: params.previousState ?? null,
    new_state: params.newState ?? null,
    actor_type: "x-admin-secret",
    request_path: new URL(params.request.url).pathname,
  });
  if (error) console.error("[admin-audit] insert failed", error.message);
}
