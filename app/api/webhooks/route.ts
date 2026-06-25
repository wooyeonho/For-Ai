import { NextResponse } from "next/server";
import { supabaseAdmin, requireAdmin, logAdminAuditEvent } from "@/lib/admin-api";
import type { WebhookEventType } from "@/lib/webhooks";

const VALID_EVENTS: WebhookEventType[] = [
  "claim.verified",
  "claim.updated",
  "claim.disputed",
  "document.published",
  "document.updated",
  "entity.created",
  "business_profile.verified",
  "correction.accepted",
  "correction.rejected",
];

// GET: List webhook subscriptions (admin)
export async function GET(request: Request) {
  const adminError = requireAdmin(request, "webhooks.read");
  if (adminError) return adminError;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Database not configured" }, { status: 500 });

  const url = new URL(request.url);
  const profileId = url.searchParams.get("profile_id");

  let query = sb
    .from("webhook_subscriptions")
    .select("id, profile_id, url, events, is_active, last_triggered_at, failure_count, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (profileId) query = query.eq("profile_id", profileId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ webhooks: data ?? [] });
}

// POST: Create a webhook subscription (admin)
export async function POST(request: Request) {
  const adminError = requireAdmin(request, "webhooks.create");
  if (adminError) return adminError;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Database not configured" }, { status: 500 });

  const body = await request.json();
  const webhookUrl = String(body.url ?? "").trim();
  const events = Array.isArray(body.events) ? body.events.map(String) : [];
  const secret = String(body.secret ?? "").trim();
  const profileId = body.profile_id ? String(body.profile_id).trim() : null;

  if (!webhookUrl || events.length === 0 || !secret) {
    return NextResponse.json(
      { error: "url, events (non-empty array), and secret are required" },
      { status: 400 },
    );
  }

  // Validate URL
  try {
    const parsed = new URL(webhookUrl);
    if (!["https:", "http:"].includes(parsed.protocol)) {
      return NextResponse.json({ error: "URL must use HTTPS or HTTP" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  // Validate events
  const invalidEvents = events.filter((e: string) => !VALID_EVENTS.includes(e as WebhookEventType));
  if (invalidEvents.length > 0) {
    return NextResponse.json(
      { error: `Invalid events: ${invalidEvents.join(", ")}. Valid: ${VALID_EVENTS.join(", ")}` },
      { status: 400 },
    );
  }

  const { data, error } = await sb
    .from("webhook_subscriptions")
    .insert({
      profile_id: profileId,
      url: webhookUrl,
      events,
      secret,
      is_active: true,
      failure_count: 0,
    })
    .select("id, url, events, is_active, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAuditEvent(sb, request, "admin.webhook.create", {
    webhook_id: data.id,
    url: webhookUrl,
    events: events.join(","),
  });

  return NextResponse.json({ webhook: data }, { status: 201 });
}

// PATCH: Update webhook (activate/deactivate)
export async function PATCH(request: Request) {
  const adminError = requireAdmin(request, "webhooks.update");
  if (adminError) return adminError;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Database not configured" }, { status: 500 });

  const body = await request.json();
  const webhookId = String(body.webhook_id ?? "").trim();
  const isActive = body.is_active;
  const events = Array.isArray(body.events) ? body.events.map(String) : undefined;

  if (!webhookId) {
    return NextResponse.json({ error: "webhook_id required" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (typeof isActive === "boolean") update.is_active = isActive;
  if (events) {
    const invalidEvents = events.filter((e: string) => !VALID_EVENTS.includes(e as WebhookEventType));
    if (invalidEvents.length > 0) {
      return NextResponse.json({ error: `Invalid events: ${invalidEvents.join(", ")}` }, { status: 400 });
    }
    update.events = events;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  // Reset failure count on re-activation
  if (isActive === true) update.failure_count = 0;

  const { data, error } = await sb
    .from("webhook_subscriptions")
    .update(update)
    .eq("id", webhookId)
    .select("id, url, events, is_active, failure_count")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAuditEvent(sb, request, "admin.webhook.update", {
    webhook_id: webhookId,
    is_active: String(data.is_active),
  });

  return NextResponse.json({ webhook: data });
}

// DELETE: Remove a webhook subscription
export async function DELETE(request: Request) {
  const adminError = requireAdmin(request, "webhooks.delete");
  if (adminError) return adminError;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Database not configured" }, { status: 500 });

  const url = new URL(request.url);
  const webhookId = url.searchParams.get("webhook_id");
  if (!webhookId) {
    return NextResponse.json({ error: "webhook_id query parameter required" }, { status: 400 });
  }

  const { error } = await sb
    .from("webhook_subscriptions")
    .delete()
    .eq("id", webhookId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAuditEvent(sb, request, "admin.webhook.delete", { webhook_id: webhookId });

  return NextResponse.json({ deleted: true });
}
