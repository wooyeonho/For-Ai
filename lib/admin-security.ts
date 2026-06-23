import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

const ADMIN_SECRET = process.env.ADMIN_SECRET ?? "";
const ADMIN_CSRF_SECRET = process.env.ADMIN_CSRF_SECRET ?? "";
const ADMIN_RATE_LIMIT_WINDOW_MS = Number(process.env.ADMIN_RATE_LIMIT_WINDOW_MS ?? 60_000);
const ADMIN_RATE_LIMIT_MAX = Number(process.env.ADMIN_RATE_LIMIT_MAX ?? 60);

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, RateLimitBucket>();

export type AdminActionType =
  | "candidates.list"
  | "candidates.update_status"
  | "generate_candidates.create"
  | "generate_candidates.metadata"
  | "promote_candidate.create_document"
  | "verify_claim.verify";

export type AdminAuditLog = {
  actionType: AdminActionType;
  targetTable?: string;
  targetId?: string | null;
  previousState?: unknown;
  newState?: unknown;
  request: Request;
};

export function authorized(request: Request): boolean {
  const auth = request.headers.get("x-admin-secret");
  return !ADMIN_SECRET || auth === ADMIN_SECRET;
}

function clientKey(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const secret = request.headers.get("x-admin-secret") ?? "no-secret";
  return `${forwardedFor ?? realIp ?? "unknown"}:${secret.slice(0, 12)}`;
}

export function rateLimit(request: Request): NextResponse | null {
  const now = Date.now();
  const key = clientKey(request);
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + ADMIN_RATE_LIMIT_WINDOW_MS });
    return null;
  }

  bucket.count += 1;
  if (bucket.count <= ADMIN_RATE_LIMIT_MAX) return null;

  return NextResponse.json(
    { error: "rate_limited", retry_after_seconds: Math.ceil((bucket.resetAt - now) / 1000) },
    { status: 429, headers: { "Retry-After": String(Math.ceil((bucket.resetAt - now) / 1000)) } }
  );
}

export function validateAdminRequest(request: Request, options: { mutation?: boolean } = {}): NextResponse | null {
  const limited = rateLimit(request);
  if (limited) return limited;

  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!options.mutation) return null;

  const origin = request.headers.get("origin");
  const requestUrl = new URL(request.url);
  if (origin) {
    const originUrl = new URL(origin);
    if (originUrl.host !== requestUrl.host) return NextResponse.json({ error: "csrf_blocked" }, { status: 403 });
  }

  if (ADMIN_CSRF_SECRET && request.headers.get("x-admin-csrf") !== ADMIN_CSRF_SECRET) {
    return NextResponse.json({ error: "csrf_token_required" }, { status: 403 });
  }

  return null;
}

export async function writeAdminAuditLog(sb: SupabaseClient, log: AdminAuditLog): Promise<void> {
  const timestamp = new Date().toISOString();
  const { error } = await sb.from("admin_audit_logs").insert({
    action_type: log.actionType,
    target_table: log.targetTable ?? null,
    target_id: log.targetId ?? null,
    previous_state: log.previousState ?? null,
    new_state: log.newState ?? null,
    created_at: timestamp,
  });

  if (error) {
    console.error("[admin/audit] failed to write admin_audit_logs", {
      action_type: log.actionType,
      target_id: log.targetId,
      message: error.message,
    });
  }
}
