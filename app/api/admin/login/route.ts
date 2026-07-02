import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

import { issueAdminSessionCookie, logAdminAuditEvent, productionAdminSecretFallbackDisabled, supabaseAdmin } from "../../../../lib/admin-api";
import { persistentRateLimited } from "../../../../lib/rate-limit-store";

const ADMIN_SECRET = process.env.ADMIN_SECRET ?? "";

// Brute-force lockout. The admin password is the single gate to every admin
// action — including the only endpoint that spends multi-provider LLM credits —
// so login attempts are throttled per client across all instances. Every attempt
// (success or failure) counts against the window; once the cap is hit the caller
// is locked out for the remainder of the window and even a correct password
// returns 429, so an attacker cannot confirm a guess during lockout.
const LOGIN_MAX_ATTEMPTS = 8;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function safeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer);
}

export async function POST(request: Request) {
  const lockout = await persistentRateLimited("admin-login", clientIp(request), LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS);
  if (lockout.limited) {
    const sb = supabaseAdmin();
    if (sb) {
      await logAdminAuditEvent(sb, request, "admin.login_locked_out", { window_ms: LOGIN_WINDOW_MS });
    }
    const retryAfterSeconds = Math.max(1, Math.ceil(lockout.retryAfterMs / 1000));
    return NextResponse.json(
      { error: "too_many_attempts", retry_after_seconds: retryAfterSeconds },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
    );
  }

  let password = "";
  try {
    const body = await request.json();
    password = String(body.password ?? "");
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (productionAdminSecretFallbackDisabled()) {
    const sb = supabaseAdmin();
    if (sb) {
      await logAdminAuditEvent(sb, request, "admin.login_blocked", {
        reason: "admin_secret_fallback_disabled_in_production",
        configured: Boolean(ADMIN_SECRET),
      });
    }
    return NextResponse.json({
      error: "admin_secret_login_disabled",
      warning: "ADMIN_SECRET fallback login is disabled in production. Use Supabase Auth admin login, or set ALLOW_BREAK_GLASS_ADMIN=true only for emergency break-glass rotation.",
    }, { status: 403 });
  }

  if (!ADMIN_SECRET || !password || !safeEqual(password, ADMIN_SECRET)) {
    const sb = supabaseAdmin();
    if (sb) {
      await logAdminAuditEvent(sb, request, "admin.login_failed", { configured: Boolean(ADMIN_SECRET) });
    }
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const response = NextResponse.json({ success: true, expires_in_seconds: 1800 });
  issueAdminSessionCookie(response);

  const sb = supabaseAdmin();
  if (sb) {
    await logAdminAuditEvent(sb, request, "admin.login", {
      success: true,
      ...(process.env.NODE_ENV === "production" ? { break_glass: true } : {}),
    });
  }

  return response;
}
