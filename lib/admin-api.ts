import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const ADMIN_SECRET = process.env.ADMIN_SECRET ?? "";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ADMIN_CSRF_SECRET = process.env.ADMIN_CSRF_SECRET ?? "";
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;

export const ADMIN_AUDIT_TABLE = "admin_audit_events";

type AdminAuditMetadata = Record<string, string | number | boolean | null | string[]>;

const buckets = new Map<string, { count: number; resetAt: number }>();

function clientKey(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip")
    ?? "unknown";
}

function rateLimited(request: Request): boolean {
  const now = Date.now();
  const key = clientKey(request);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT_MAX;
}

function csrfValid(request: Request): boolean {
  if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") return true;
  const token = request.headers.get("x-admin-csrf") ?? "";
  if (ADMIN_CSRF_SECRET) return token === ADMIN_CSRF_SECRET;
  return token === "1";
}

export function supabaseAdmin(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

export function missingSupabaseAdminEnv(): string[] {
  return [
    ...(!SUPABASE_URL ? ["NEXT_PUBLIC_SUPABASE_URL"] : []),
    ...(!SUPABASE_SERVICE_ROLE_KEY ? ["SUPABASE_SERVICE_ROLE_KEY"] : []),
  ];
}

export function authorized(request: Request): boolean {
  const auth = request.headers.get("x-admin-secret");
  return !ADMIN_SECRET || auth === ADMIN_SECRET;
}

export function safeRequestMetadata(request: Request): AdminAuditMetadata {
  const userAgent = request.headers.get("user-agent") ?? "unknown";
  return {
    user_agent_hash: createHash("sha256").update(userAgent).digest("hex").slice(0, 16),
    method: request.method,
  };
}

export async function logAdminAuditEvent(
  sb: SupabaseClient,
  request: Request,
  action: string,
  metadata: AdminAuditMetadata = {}
): Promise<void> {
  const { error } = await sb.from(ADMIN_AUDIT_TABLE).insert({
    action,
    metadata: {
      ...safeRequestMetadata(request),
      ...metadata,
    },
  });

  if (error) {
    console.error("[admin-audit] insert failed", {
      table: ADMIN_AUDIT_TABLE,
      action,
      message: error.message,
      code: error.code,
    });
  }
}

export function requireAdmin(request: Request, action: string): NextResponse | null {
  if (rateLimited(request)) {
    console.info("[admin-audit]", JSON.stringify({ action, allowed: false, reason: "rate_limited", at: new Date().toISOString() }));
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const auth = request.headers.get("x-admin-secret") ?? "";
  if (!ADMIN_SECRET || auth !== ADMIN_SECRET) {
    console.info("[admin-audit]", JSON.stringify({ action, allowed: false, reason: ADMIN_SECRET ? "bad_secret" : "missing_admin_secret_config", at: new Date().toISOString() }));
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!csrfValid(request)) {
    console.info("[admin-audit]", JSON.stringify({ action, allowed: false, reason: "bad_csrf", at: new Date().toISOString() }));
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }

  return null;
}
