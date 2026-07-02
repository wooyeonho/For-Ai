// Supabase Edge Function — Deno runtime
// Sends email_digest notifications to watch_subscriptions where:
//   - notification_preference = 'email_digest'
//   - notification_sent_at is null OR older than 24h
//   - resolved_at is null (still watching)
//
// Requires env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, NOTIFY_WATCHERS_SECRET
//
// Callers must present the shared secret via the `x-notify-secret` header
// (or `Authorization: Bearer <secret>`); the function fails closed when the
// secret is missing from the environment.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM_ADDRESS = "For-Ai <noreply@for-ai.app>";
const DIGEST_INTERVAL_HOURS = 24;

interface WatchSubscription {
  id: string;
  contributor_hash: string;
  entity_id: string | null;
  document_id: string | null;
  claim_id: string | null;
  category: string | null;
  country: string;
  event_type: string;
  notification_preference: string;
  notification_sent_at: string | null;
  contributor_email?: string | null;
}

// Constant-time comparison to avoid leaking the secret via timing differences.
function secretMatches(provided: string, expected: string): boolean {
  const enc = new TextEncoder();
  const a = enc.encode(provided);
  const b = enc.encode(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Fail closed: this function runs with the service-role key and sends email
  // via Resend, so it must never be triggerable by unauthenticated callers.
  const notifySecret = Deno.env.get("NOTIFY_WATCHERS_SECRET");
  if (!notifySecret) {
    return new Response(JSON.stringify({ error: "NOTIFY_WATCHERS_SECRET is not configured" }), { status: 503 });
  }
  const authHeader = req.headers.get("authorization") ?? "";
  const provided = req.headers.get("x-notify-secret")
    ?? (authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7) : "");
  if (!provided || !secretMatches(provided, notifySecret)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");

  if (!supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ error: "Missing Supabase env vars" }), { status: 500 });
  }
  if (!resendKey) {
    return new Response(JSON.stringify({ error: "Missing RESEND_API_KEY" }), { status: 500 });
  }

  const sb = createClient(supabaseUrl, supabaseKey);
  const cutoff = new Date(Date.now() - DIGEST_INTERVAL_HOURS * 60 * 60 * 1000).toISOString();

  const { data: subscriptions, error } = await sb
    .from("watch_subscriptions")
    .select("id, contributor_hash, entity_id, document_id, claim_id, category, country, event_type, notification_preference, notification_sent_at")
    .eq("notification_preference", "email_digest")
    .is("resolved_at", null)
    .or(`notification_sent_at.is.null,notification_sent_at.lt.${cutoff}`)
    .limit(50);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const subs = (subscriptions ?? []) as WatchSubscription[];
  if (subs.length === 0) {
    return new Response(JSON.stringify({ sent: 0, message: "No pending digests" }), { status: 200 });
  }

  // Fetch document titles for context
  const documentIds = [...new Set(subs.map((s) => s.document_id).filter(Boolean))];
  const { data: documents } = documentIds.length > 0
    ? await sb.from("documents").select("id, title, slug").in("id", documentIds)
    : { data: [] };

  const docMap = new Map((documents ?? []).map((d: { id: string; title: string; slug: string }) => [d.id, d]));

  let sent = 0;
  const sentIds: string[] = [];

  for (const sub of subs) {
    // Look up contributor email from auth.users via contributor_hash
    // For now, we use contributor_hash as a safe identifier in the digest subject
    const doc = sub.document_id ? docMap.get(sub.document_id) : null;
    const subject = doc
      ? `[For-Ai] 구독 알림: ${doc.title} — ${sub.event_type}`
      : `[For-Ai] 구독 알림: ${sub.category ?? sub.country ?? "전체"} — ${sub.event_type}`;

    const docLink = doc
      ? `https://for-ai.app/ko/wiki/${doc.slug}`
      : "https://for-ai.app";

    const html = `
      <h2>For-Ai 구독 알림</h2>
      <p>구독하신 팩트에 업데이트가 있습니다.</p>
      <table style="border-collapse:collapse;width:100%;max-width:480px">
        <tr><td style="padding:4px 8px;color:#5f6b7a">이벤트</td><td style="padding:4px 8px">${sub.event_type}</td></tr>
        ${doc ? `<tr><td style="padding:4px 8px;color:#5f6b7a">문서</td><td style="padding:4px 8px"><a href="${docLink}">${doc.title}</a></td></tr>` : ""}
        ${sub.category ? `<tr><td style="padding:4px 8px;color:#5f6b7a">카테고리</td><td style="padding:4px 8px">${sub.category}</td></tr>` : ""}
      </table>
      <p style="margin-top:24px"><a href="${docLink}" style="background:#24415f;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none">팩트 확인하기</a></p>
      <p style="font-size:12px;color:#5f6b7a;margin-top:32px">이 이메일은 For-Ai 구독 설정에 따라 자동 발송됩니다.</p>
    `;

    // NOTE: Resend requires a verified To address. In production, retrieve the
    // actual email address associated with the contributor_hash from auth.users.
    // For now this sends to a placeholder — replace with real lookup before deploying.
    const toEmail = `${sub.contributor_hash.slice(0, 8)}@placeholder.invalid`;

    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM_ADDRESS, to: [toEmail], subject, html }),
    });

    if (res.ok) {
      sentIds.push(sub.id);
      sent++;
    }
  }

  // Update notification_sent_at for successfully sent subscriptions
  if (sentIds.length > 0) {
    await sb
      .from("watch_subscriptions")
      .update({ notification_sent_at: new Date().toISOString() })
      .in("id", sentIds);
  }

  return new Response(
    JSON.stringify({ sent, total: subs.length, message: `Sent ${sent}/${subs.length} digests` }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
