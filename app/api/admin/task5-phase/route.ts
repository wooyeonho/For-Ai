import { NextResponse } from "next/server";
import { getAdminAuthContext, logAdminAuditEvent, requireAdmin, supabaseAdmin } from "@/lib/admin-api";

// Bible v7 Book IV section 11: task5_settings.phase is a single-row DB SSOT.
// The only writer is the set_task5_phase RPC (service-role only). This route
// exists solely to gate + forward that RPC call behind the existing
// ADMIN_SECRET-based admin auth model (requireAdmin), matching every other
// admin-privileged write in this app -- there is no Supabase Auth JWT role
// path for this action.
export async function POST(request: Request) {
  const denied = await requireAdmin(request, "task5.set_phase");
  if (denied) return denied;

  let body: { phase?: unknown; reason?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const phase = body.phase;
  const reason = body.reason;
  if (typeof phase !== "number" || !Number.isInteger(phase) || phase < 0 || phase > 4) {
    return NextResponse.json({ error: "invalid_phase" }, { status: 400 });
  }
  if (typeof reason !== "string" || reason.trim().length === 0) {
    return NextResponse.json({ error: "reason_required" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const { data, error } = await sb.rpc("set_task5_phase", {
    p_phase: phase,
    p_reason: reason,
  });

  if (error) {
    return NextResponse.json({ error: "phase_transition_rejected", detail: error.message }, { status: 400 });
  }

  await logAdminAuditEvent(sb, request, "task5.phase_changed", { new_phase: phase, reason });

  return NextResponse.json({ settings: data }, { headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  const denied = await requireAdmin(request, "task5.view_phase");
  if (denied) return denied;

  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ phase: 0, draft_enabled: false, configured: false });

  const { data, error } = await sb.from("task5_settings").select("phase, draft_enabled, updated_at").eq("id", true).maybeSingle();
  if (error || !data) {
    // Fail closed, matching the app-layer contract: a missing/unreadable
    // settings row means phase 0, draft disabled -- never fail open.
    return NextResponse.json({ phase: 0, draft_enabled: false, configured: true }, { headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.json(
    { phase: data.phase, draft_enabled: data.draft_enabled, updated_at: data.updated_at, configured: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PATCH(request: Request) {
  const denied = await requireAdmin(request, "task5.set_draft_enabled");
  if (denied) return denied;

  let body: { draft_enabled?: unknown; reason?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.draft_enabled !== "boolean") {
    return NextResponse.json({ error: "invalid_draft_enabled" }, { status: 400 });
  }
  if (typeof body.reason !== "string" || body.reason.trim().length === 0) {
    return NextResponse.json({ error: "reason_required" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });
  const authContext = getAdminAuthContext(request);
  const { data, error } = await sb.rpc("set_task5_draft_enabled", {
    p_enabled: body.draft_enabled,
    p_reason: body.reason.trim(),
    p_admin_user_id: authContext?.adminUserId ?? null,
    p_admin_user_hash: authContext?.adminUserHash ?? null,
  });
  if (error) {
    return NextResponse.json({ error: "draft_toggle_rejected" }, { status: 400 });
  }
  return NextResponse.json({ settings: data }, { headers: { "Cache-Control": "no-store" } });
}
