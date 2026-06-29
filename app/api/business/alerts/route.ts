import { NextResponse } from "next/server";
import { supabaseAdmin, requireAdmin, logAdminAuditEvent } from "@/lib/admin-api";

// GET: Fetch reputation alerts for a profile (requires admin or API key auth)
export async function GET(request: Request) {
  const adminError = await requireAdmin(request, "reputation_alerts.read");
  if (adminError) return adminError;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Database not configured" }, { status: 500 });

  const url = new URL(request.url);
  const profileId = url.searchParams.get("profile_id");
  const unreadOnly = url.searchParams.get("unread") === "true";

  if (!profileId) {
    return NextResponse.json({ error: "profile_id query parameter required" }, { status: 400 });
  }

  let query = sb
    .from("reputation_alerts")
    .select("*")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (unreadOnly) query = query.eq("is_read", false);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ alerts: data ?? [] });
}

// POST: Admin — create a new reputation alert (triggered by system or admin)
export async function POST(request: Request) {
  const adminError = await requireAdmin(request, "reputation_alerts.create");
  if (adminError) return adminError;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Database not configured" }, { status: 500 });

  const body = await request.json();
  const profileId = String(body.profile_id ?? "").trim();
  const entityId = String(body.entity_id ?? "").trim();
  const alertType = String(body.alert_type ?? "incorrect_citation").trim();
  const severity = String(body.severity ?? "info").trim();
  const title = String(body.title ?? "").trim();
  const description = body.description ? String(body.description).trim() : null;
  const relatedClaimId = body.related_claim_id ? String(body.related_claim_id).trim() : null;
  const aiService = body.ai_service ? String(body.ai_service).trim() : null;

  if (!profileId || !entityId || !title) {
    return NextResponse.json(
      { error: "profile_id, entity_id, and title are required" },
      { status: 400 },
    );
  }

  const validTypes = ["incorrect_citation", "outdated_fact", "new_hallucination", "claim_disputed", "verification_expired"];
  const validSeverities = ["info", "warning", "critical"];
  if (!validTypes.includes(alertType) || !validSeverities.includes(severity)) {
    return NextResponse.json({ error: "Invalid alert_type or severity" }, { status: 400 });
  }

  const { data, error } = await sb
    .from("reputation_alerts")
    .insert({
      profile_id: profileId,
      entity_id: entityId,
      alert_type: alertType,
      severity,
      title,
      description,
      related_claim_id: relatedClaimId,
      ai_service: aiService,
    })
    .select("id, alert_type, severity, title, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAuditEvent(sb, request, "admin.reputation_alert.create", {
    profile_id: profileId,
    entity_id: entityId,
    alert_type: alertType,
    severity,
  });

  return NextResponse.json({ alert: data }, { status: 201 });
}

// PATCH: Mark alerts as read or resolved
export async function PATCH(request: Request) {
  const adminError = await requireAdmin(request, "reputation_alerts.update");
  if (adminError) return adminError;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Database not configured" }, { status: 500 });

  const body = await request.json();
  const alertId = String(body.alert_id ?? "").trim();
  const markRead = body.is_read === true;
  const markResolved = body.is_resolved === true;

  if (!alertId) {
    return NextResponse.json({ error: "alert_id required" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (markRead) update.is_read = true;
  if (markResolved) {
    update.is_resolved = true;
    update.resolved_at = new Date().toISOString();
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await sb
    .from("reputation_alerts")
    .update(update)
    .eq("id", alertId)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ alert: data });
}
