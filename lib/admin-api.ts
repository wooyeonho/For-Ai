import { createHash } from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const ADMIN_SECRET = process.env.ADMIN_SECRET ?? "";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export const ADMIN_AUDIT_TABLE = "admin_audit_events";

type AdminAuditMetadata = Record<string, string | number | boolean | null | string[]>;

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
