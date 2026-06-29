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

const FORBIDDEN_AUDIT_METADATA_KEYS = new Set([
  "ip",
  "raw_ip",
  "client_ip",
  "x_forwarded_for",
  "x_real_ip",
  "user_agent",
  "raw_user_agent",
]);

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

// Reject browser-originated cross-site requests. Browsers set Sec-Fetch-Site
// automatically and it cannot be forged by a cross-site attacker; the Origin
// header is a fallback for older browsers. A request with neither header is a
// non-browser client (curl/server-to-server), which is not a CSRF vector.
function sameOriginOk(request: Request): boolean {
  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite) {
    return secFetchSite === "same-origin" || secFetchSite === "same-site" || secFetchSite === "none";
  }
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      const host = request.headers.get("host") ?? "";
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  return true;
}

function csrfValid(request: Request): boolean {
  if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") return true;
  // Block cross-site browser forgeries regardless of token.
  if (!sameOriginOk(request)) return false;
  const token = request.headers.get("x-admin-csrf") ?? "";
  // When a CSRF secret is configured, require an exact match (strongest).
  if (ADMIN_CSRF_SECRET) return token === ADMIN_CSRF_SECRET;
  // Otherwise require the custom header to be present at all — this forces a
  // CORS preflight for cross-origin callers — combined with the same-origin
  // check above. The literal value is not treated as a secret.
  return token.length > 0;
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
  const auth = request.headers.get("x-admin-secret") ?? "";
  return Boolean(ADMIN_SECRET) && auth === ADMIN_SECRET;
}

export function safeRequestMetadata(request: Request): AdminAuditMetadata {
  const userAgent = request.headers.get("user-agent") ?? "unknown";
  return {
    user_agent_hash: createHash("sha256").update(userAgent).digest("hex").slice(0, 16),
    method: request.method,
  };
}

function sanitizeAdminAuditMetadata(metadata: AdminAuditMetadata): AdminAuditMetadata {
  return Object.fromEntries(
    Object.entries(metadata).filter(([key]) => !FORBIDDEN_AUDIT_METADATA_KEYS.has(key.toLowerCase()))
  );
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
      ...sanitizeAdminAuditMetadata(metadata),
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
