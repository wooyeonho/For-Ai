import { NextResponse } from "next/server";
import {
  authorized,
  enforceAdminCsrf,
  enforceAdminRateLimit,
  enforceAdminReadRateLimit,
  recordAdminAuditEvent,
  supabaseAdmin,
} from "../../../../lib/admin-api";

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rateLimited = enforceAdminReadRateLimit(request);
  if (rateLimited) return rateLimited;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? "new";
  let query = sb.from("topic_candidates").select("*").order("created_at", { ascending: false }).limit(100);
  if (status !== "all") query = query.eq("status", status);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ candidates: data ?? [] });
}

export async function PATCH(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const csrfError = enforceAdminCsrf(request);
  if (csrfError) return csrfError;
  const rateLimited = enforceAdminRateLimit(request);
  if (rateLimited) return rateLimited;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });

  const body = await request.json();
  const id = String(body.id ?? "").trim();
  const status = String(body.status ?? "").trim();
  const allowed = new Set(["new", "reviewing", "approved", "rejected", "promoted", "spam"]);
  if (!id || !allowed.has(status)) return NextResponse.json({ error: "valid id and status are required" }, { status: 400 });

  const { data: previousCandidate, error: previousError } = await sb
    .from("topic_candidates")
    .select("id, status, reviewed_at")
    .eq("id", id)
    .single();
  if (previousError || !previousCandidate) return NextResponse.json({ error: "candidate not found", detail: previousError?.message }, { status: 404 });

  const { data, error } = await sb
    .from("topic_candidates")
    .update({ status, reviewed_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await recordAdminAuditEvent(sb, {
    actionType: "candidate_status_updated",
    targetTable: "topic_candidates",
    targetId: id,
    previousState: previousCandidate,
    newState: data,
    request,
  });
  return NextResponse.json({ candidate: data });
}
