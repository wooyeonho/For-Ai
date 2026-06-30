import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient, isServiceRoleKeyConfigured } from "./supabase-server";

const ADMIN_SECRET = process.env.ADMIN_SECRET ?? "";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ADMIN_CSRF_SECRET = process.env.ADMIN_CSRF_SECRET ?? "";
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;
const ADMIN_SESSION_COOKIE = "for_ai_admin_session";
const ADMIN_SESSION_TTL_SECONDS = 30 * 60;

export const ADMIN_AUDIT_TABLE = "admin_audit_events";
export const ADMIN_USERS_TABLE = "admin_users";

export type AdminRole = "viewer" | "editor" | "verifier" | "moderator" | "admin";

const FORBIDDEN_AUDIT_METADATA_KEYS = new Set([
  "ip",
  "raw_ip",
  "client_ip",
  "x_forwarded_for",
  "x_real_ip",
  "user_agent",
  "raw_user_agent",
]);

type AdminAuditValue = string | number | boolean | null | string[];
type AdminAuditMetadata = Record<string, AdminAuditValue>;

type AdminAuthContext = {
  adminUserId: string | null;
  adminUserHash: string;
  role: AdminRole;
  authMethod: "supabase" | "admin_secret";
};

type AdminUserRow = {
  user_id?: string | null;
  id?: string | null;
  role?: string | null;
  active?: boolean | null;
};

const ROLE_RANK: Record<AdminRole, number> = {
  viewer: 0,
  editor: 1,
  verifier: 2,
  moderator: 3,
  admin: 4,
};

const ACTION_REQUIRED_ROLES: Array<[RegExp, AdminRole]> = [
  [/^admin\.import$|^api_keys\.|^webhooks\.|^business_profiles\./, "admin"],
  [/^posts\.|^business_corrections\.|^reputation_alerts\./, "moderator"],
  [/^claims\.verify$|^candidates\.promote$|^admin\.review\./, "verifier"],
  [/^candidates\.(generate|bulk_import|update)$|^document\.create$|^entity\.create$|^claims\.check_source$/, "editor"],
  [/\.read$|\.list$|read_for_review$|generate_metadata$/, "viewer"],
];

const authContexts = new WeakMap<Request, AdminAuthContext>();
const buckets = new Map<string, { count: number; resetAt: number }>();

function hashSafe(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function shortHash(value: string): string {
  return hashSafe(value).slice(0, 16);
}

function safeSecretEqual(expected: string, actual: string): boolean {
  if (!expected || !actual) return false;
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

function clientKey(request: Request): string {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip")
    ?? "unknown";
  return `ip:${shortHash(ip)}`;
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
  if (!sameOriginOk(request)) return false;
  const token = request.headers.get("x-admin-csrf") ?? "";
  if (ADMIN_CSRF_SECRET) return safeSecretEqual(ADMIN_CSRF_SECRET, token);
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
  return createServiceRoleClient();
}

export function missingSupabaseAdminEnv(): string[] {
  return [
    ...(!SUPABASE_URL ? ["NEXT_PUBLIC_SUPABASE_URL"] : []),
    ...(!isServiceRoleKeyConfigured() ? ["SUPABASE_SERVICE_ROLE_KEY"] : []),
  ];
}

export function requiredRoleForAction(action: string): AdminRole {
  return ACTION_REQUIRED_ROLES.find(([pattern]) => pattern.test(action))?.[1] ?? "admin";
}

function hasRole(role: AdminRole, requiredRole: AdminRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[requiredRole];
}

function normalizeRole(role: string | null | undefined): AdminRole | null {
  if (role === "viewer" || role === "editor" || role === "verifier" || role === "moderator" || role === "admin") return role;
  return null;
}

async function supabaseAuthContext(request: Request): Promise<AdminAuthContext | null> {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const sb = supabaseAdmin();
  if (!sb) return null;

  const { data: userData, error: userError } = await sb.auth.getUser(match[1]);
  const user = userData.user;
  if (userError || !user) return null;

  const { data: adminUser, error: adminUserError } = await sb
    .from(ADMIN_USERS_TABLE)
    .select("user_id, id, role, active")
    .eq("user_id", user.id)
    .maybeSingle<AdminUserRow>();

  if (adminUserError || !adminUser || adminUser.active === false) return null;
  const role = normalizeRole(adminUser.role);
  if (!role) return null;

  return {
    adminUserId: adminUser.user_id ?? adminUser.id ?? user.id,
    adminUserHash: hashSafe(`supabase:${user.id}`),
    role,
    authMethod: "supabase",
  };
}

function cookieSessionContext(request: Request): AdminAuthContext | null {
  if (!adminSessionValid(request)) return null;
  return {
    adminUserId: null,
    adminUserHash: hashSafe(`admin_cookie:${ADMIN_SECRET}`),
    role: "admin",
    authMethod: "admin_secret",
  };
}

function fallbackSecretContext(request: Request): AdminAuthContext | null {
  if (!internalSecretValid(request)) return null;
  return {
    adminUserId: null,
    adminUserHash: hashSafe(`admin_secret:${ADMIN_SECRET}`),
    role: "admin",
    authMethod: "admin_secret",
  };
}

export async function authorized(request: Request): Promise<boolean> {
  return (await supabaseAuthContext(request)) !== null || cookieSessionContext(request) !== null || fallbackSecretContext(request) !== null;
}

export function safeRequestMetadata(request: Request): AdminAuditMetadata {
  const userAgent = request.headers.get("user-agent") ?? "unknown";
  const adminActor = request.headers.get("x-admin-actor")?.trim();
  return {
    user_agent_hash: shortHash(userAgent),
    ...(adminActor ? { admin_actor_hash: shortHash(adminActor) } : {}),
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
  metadata: AdminAuditMetadata = {},
  targetId?: string | null
): Promise<void> {
  const context = authContexts.get(request);
  const resolvedTargetId = targetId ?? (typeof metadata.target_id === "string" ? metadata.target_id : null);
  const { error } = await sb.from(ADMIN_AUDIT_TABLE).insert({
    admin_user_id: context?.adminUserId ?? null,
    admin_user_hash: context?.adminUserHash ?? shortHash("unknown-admin"),
    action,
    target_id: resolvedTargetId,
    metadata: {
      ...safeRequestMetadata(request),
      admin_role: context?.role ?? null,
      auth_method: context?.authMethod ?? "unknown",
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

export async function requireAdmin(request: Request, action: string): Promise<NextResponse | null> {
  if (rateLimited(request)) {
    console.info("[admin-audit]", JSON.stringify({ action, allowed: false, reason: "rate_limited", at: new Date().toISOString() }));
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const context = await supabaseAuthContext(request) ?? cookieSessionContext(request) ?? fallbackSecretContext(request);
  if (!context) {
    console.info("[admin-audit]", JSON.stringify({ action, allowed: false, reason: "unauthorized", at: new Date().toISOString() }));
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const requiredRole = requiredRoleForAction(action);
  if (!hasRole(context.role, requiredRole)) {
    console.info("[admin-audit]", JSON.stringify({ action, allowed: false, reason: "insufficient_role", role: context.role, required_role: requiredRole, at: new Date().toISOString() }));
    return NextResponse.json({ error: "forbidden", required_role: requiredRole }, { status: 403 });
  }

  if (!csrfValid(request)) {
    console.info("[admin-audit]", JSON.stringify({ action, allowed: false, reason: "bad_csrf", at: new Date().toISOString() }));
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }

  authContexts.set(request, context);
  return null;
}
