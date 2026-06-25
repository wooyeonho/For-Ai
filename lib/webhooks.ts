import { createHmac } from "crypto";
import { supabaseAdmin } from "./admin-api";

export type WebhookEventType =
  | "claim.verified"
  | "claim.updated"
  | "claim.disputed"
  | "document.published"
  | "document.updated"
  | "entity.created"
  | "business_profile.verified"
  | "correction.accepted"
  | "correction.rejected";

export interface WebhookSubscription {
  id: string;
  profile_id: string | null;
  url: string;
  events: WebhookEventType[];
  secret: string;
  is_active: boolean;
  created_at: string;
  last_triggered_at: string | null;
  failure_count: number;
}

interface WebhookPayload {
  event: WebhookEventType;
  timestamp: string;
  data: Record<string, unknown>;
}

function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export async function triggerWebhooks(
  event: WebhookEventType,
  data: Record<string, unknown>,
): Promise<void> {
  const sb = supabaseAdmin();
  if (!sb) return;

  const { data: subscriptions } = await sb
    .from("webhook_subscriptions")
    .select("*")
    .eq("is_active", true)
    .contains("events", [event]);

  if (!subscriptions || subscriptions.length === 0) return;

  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    data,
  };
  const body = JSON.stringify(payload);

  const deliveries = subscriptions.map(async (sub: WebhookSubscription) => {
    const signature = signPayload(body, sub.secret);

    try {
      const res = await fetch(sub.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-ForAi-Event": event,
          "X-ForAi-Signature": `sha256=${signature}`,
          "X-ForAi-Delivery": crypto.randomUUID(),
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });

      if (res.ok) {
        await sb
          .from("webhook_subscriptions")
          .update({ last_triggered_at: new Date().toISOString(), failure_count: 0 })
          .eq("id", sub.id);
      } else {
        await incrementFailureCount(sb, sub);
      }
    } catch {
      await incrementFailureCount(sb, sub);
    }
  });

  await Promise.allSettled(deliveries);
}

async function incrementFailureCount(
  sb: ReturnType<typeof supabaseAdmin>,
  sub: WebhookSubscription,
): Promise<void> {
  if (!sb) return;
  const newCount = sub.failure_count + 1;
  const update: Record<string, unknown> = { failure_count: newCount };
  // Auto-disable after 10 consecutive failures
  if (newCount >= 10) update.is_active = false;
  await sb.from("webhook_subscriptions").update(update).eq("id", sub.id);
}
