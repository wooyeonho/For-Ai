import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const ADMIN_SECRET = process.env.ADMIN_SECRET ?? "";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ADMIN_CSRF_SECRET = process.env.ADMIN_CSRF_SECRET ?? "";
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;
const ADMIN_SESSION_COOKIE = "for_ai_admin_session";
const ADMIN_SESSION_TTL_SECONDS = 30 * 60;

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

function safeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer);
}

function signSessionPayload(payload: string): string {
  return createHmac("sha256", ADMIN_SECRET).update(payload).digest("base64url");
}

function adminSessionValid(request: Request): boolean {
  if (!ADMIN_SECRET) return false;
  const cookie = request.headers.get("cookie") ?? "";
  const token = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ADMIN_SESSION_COOKIE}=`))
    ?.slice(ADMIN_SESSION_COOKIE.length + 1);
  if (!token) return false;
  const [expiresAtRaw, nonce, signature] = token.split(".");
  if (!expiresAtRaw || !nonce || !signature) return false;
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false;
  const expected = signSessionPayload(`${expiresAtRaw}.${nonce}`);
  return safeEqual(signature, expected);
}

function internalSecretValid(request: Request): boolean {
  if (!ADMIN_SECRET) return false;
  const auth = request.headers.get("x-admin-secret") ?? "";
  if (!safeEqual(auth, ADMIN_SECRET)) return false;
  // x-admin-secret is reserved for CLI/internal callers. Browser-originated
  // requests should use the httpOnly session cookie minted by /api/admin/login.
  return !request.headers.get("origin") && !request.headers.get("sec-fetch-site");
}

export function issueAdminSessionCookie(response: NextResponse): void {
  const expiresAt = Date.now() + ADMIN_SESSION_TTL_SECONDS * 1000;
  const nonce = randomBytes(16).toString("base64url");
  const payload = `${expiresAt}.${nonce}`;
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: `${payload}.${signSessionPayload(payload)}`,
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: ADMIN_SESSION_TTL_SECONDS,
  });
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
  return adminSessionValid(request) || internalSecretValid(request);
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

  if (!ADMIN_SECRET || !authorized(request)) {
    const hasBrowserSecret = Boolean(request.headers.get("x-admin-secret"))
      && (Boolean(request.headers.get("origin")) || Boolean(request.headers.get("sec-fetch-site")));
    console.info("[admin-audit]", JSON.stringify({ action, allowed: false, reason: !ADMIN_SECRET ? "missing_admin_secret_config" : hasBrowserSecret ? "browser_secret_rejected" : "bad_session_or_secret", at: new Date().toISOString() }));
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!csrfValid(request)) {
    console.info("[admin-audit]", JSON.stringify({ action, allowed: false, reason: "bad_csrf", at: new Date().toISOString() }));
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }

  return null;
}
