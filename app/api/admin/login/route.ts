import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

import { issueAdminSessionCookie, logAdminAuditEvent, supabaseAdmin } from "@/lib/admin-api";

const ADMIN_SECRET = process.env.ADMIN_SECRET ?? "";

function safeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer);
}

export async function POST(request: Request) {
  let password = "";
  try {
    const body = await request.json();
    password = String(body.password ?? "");
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
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
    await logAdminAuditEvent(sb, request, "admin.login", { success: true, auth_method: "admin_secret", admin_role: "admin" });
  }

  return response;
}
