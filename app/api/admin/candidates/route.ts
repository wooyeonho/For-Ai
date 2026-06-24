import { NextResponse } from "next/server";

import { authorized, logAdminAuditEvent, supabaseAdmin } from "@/lib/admin-api";

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? "new";
  let query = sb.from("topic_candidates").select("*").order("created_at", { ascending: false }).limit(100);
  if (status !== "all") query = query.eq("status", status);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAdminAuditEvent(sb, request, "admin.candidates.list", {
    status,
    result_count: data?.length ?? 0,
  });
  return NextResponse.json({ candidates: data ?? [] });
}

export async function PATCH(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });

  const body = await request.json();
  const id = String(body.id ?? "").trim();
  const status = String(body.status ?? "").trim();
  const allowed = new Set(["new", "reviewing", "approved", "rejected", "promoted", "spam"]);
  if (!id || !allowed.has(status)) return NextResponse.json({ error: "valid id and status are required" }, { status: 400 });

  const { data, error } = await sb
    .from("topic_candidates")
    .update({ status, reviewed_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAdminAuditEvent(sb, request, "admin.candidates.update_status", {
    candidate_id: id,
    status,
  });
  return NextResponse.json({ candidate: data });
}
