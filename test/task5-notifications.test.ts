import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  normalizeNotificationFailureCode,
  runNotificationOutboxBatch,
  type NotificationWorkerClient,
} from "../lib/task5-notifications";

function lease(id: string, attempts = 1) {
  return {
    id,
    event_id: `event-${id}`,
    recipient_id: `recipient-${id}`,
    reasons: ["wanted_claim_published"],
    status: "processing" as const,
    attempts,
    worker_id: "worker-test",
    lock_expires_at: "2030-01-01T00:00:00.000Z",
  };
}

test("notification error codes are sanitized without storing provider messages", () => {
  assert.equal(normalizeNotificationFailureCode({ code: "HTTP 503: upstream/email@example.com" }), "http_503_upstream_email_example_com");
  assert.equal(normalizeNotificationFailureCode(new Error("secret response body")), "error");
  assert.equal(normalizeNotificationFailureCode(null), "delivery_failed");
});

test("worker leases and atomically completes each notification", async () => {
  const calls: Array<{ name: string; params: Record<string, unknown> }> = [];
  const client: NotificationWorkerClient = {
    async rpc(name, params) {
      calls.push({ name, params });
      if (name === "lease_notification_outbox") return { data: [lease("one"), lease("two")], error: null };
      return { data: { changed: true }, error: null };
    },
  };

  const result = await runNotificationOutboxBatch(client, { workerId: "worker-test", limit: 500 });
  assert.deepEqual(result, {
    workerId: "worker-test",
    leased: 2,
    delivered: 2,
    failed: 0,
    dead: 0,
    errors: [],
  });
  assert.equal(calls[0].params.p_limit, 100);
  assert.deepEqual(calls.map((call) => call.name), [
    "lease_notification_outbox",
    "complete_notification_outbox",
    "complete_notification_outbox",
  ]);
});

test("worker records a sanitized retry and reports terminal DLQ state", async () => {
  const calls: string[] = [];
  const client: NotificationWorkerClient = {
    async rpc(name) {
      calls.push(name);
      if (name === "lease_notification_outbox") return { data: [lease("dead", 5)], error: null };
      if (name === "complete_notification_outbox") return { data: null, error: { code: "PGRST 500 / raw detail" } };
      return { data: { changed: true, dead: true }, error: null };
    },
  };

  const result = await runNotificationOutboxBatch(client, { workerId: "worker-test" });
  assert.equal(result.failed, 1);
  assert.equal(result.dead, 1);
  assert.deepEqual(result.errors, [{ outboxId: "dead", code: "pgrst_500_raw_detail" }]);
  assert.deepEqual(calls, ["lease_notification_outbox", "complete_notification_outbox", "fail_notification_outbox"]);
});

test("invalid worker identity fails before touching the database", async () => {
  const client: NotificationWorkerClient = {
    async rpc() {
      throw new Error("should not run");
    },
  };
  await assert.rejects(() => runNotificationOutboxBatch(client, { workerId: "x" }), /invalid_worker_id/);
});

test("Task 5-D migration enforces dedupe, retry/DLQ, worker-only writes, and owner unread RLS", () => {
  const migration = readFileSync(
    join(process.cwd(), "supabase/migrations/20260717083314_task5_d_notifications.sql"),
    "utf8",
  );
  assert.match(migration, /unique \(event_id, recipient_id\)/);
  assert.match(migration, /task5_merge_notification_reasons/);
  assert.match(migration, /for update skip locked/);
  assert.match(migration, /notification_dead_letters/);
  assert.match(migration, /p_max_attempts integer default 5/);
  assert.match(migration, /notifications_owner_select/);
  assert.match(migration, /task5_current_user_owns_contributor\(recipient_id\)/);
  assert.match(migration, /grant update \(read_at\)[\s\S]*authenticated/);
  assert.match(migration, /revoke all on table public\.notifications from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.lease_notification_outbox[\s\S]*service_role/);
  assert.doesNotMatch(migration, /contact_email|provider_response|response_body/);
});
