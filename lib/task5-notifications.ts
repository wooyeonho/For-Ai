import "server-only";

import { randomUUID } from "node:crypto";

export type NotificationOutboxLease = {
  id: string;
  event_id: string;
  recipient_id: string;
  reasons: string[];
  status: "processing";
  attempts: number;
  worker_id: string;
  lock_expires_at: string;
};

export type NotificationWorkerResult = {
  workerId: string;
  leased: number;
  delivered: number;
  failed: number;
  dead: number;
  errors: Array<{ outboxId: string; code: string }>;
};

type RpcResult<T> = { data: T | null; error: { code?: string; message?: string } | null };

export interface NotificationWorkerClient {
  rpc(name: string, params: Record<string, unknown>): PromiseLike<RpcResult<unknown>>;
}

export type NotificationWorkerOptions = {
  limit?: number;
  leaseSeconds?: number;
  maxAttempts?: number;
  workerId?: string;
};

function integerInRange(value: number | undefined, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value!)));
}

export function normalizeNotificationFailureCode(error: unknown): string {
  const candidate = typeof error === "string"
    ? error
    : typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : error instanceof Error
      ? error.name
      : "delivery_failed";
  const normalized = candidate
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  return normalized || "delivery_failed";
}

function rpcError(result: RpcResult<unknown>, fallback: string): Error & { code: string } {
  const code = normalizeNotificationFailureCode(result.error?.code || fallback);
  const error = new Error(fallback) as Error & { code: string };
  error.code = code;
  return error;
}

/**
 * Moves due outbox rows into the RLS-protected in-app inbox.
 *
 * Leasing, notification upsert, and the delivered transition are database
 * transactions. A replay therefore creates no duplicate inbox row. Provider
 * payloads and recipient contact data never pass through this worker.
 */
export async function runNotificationOutboxBatch(
  client: NotificationWorkerClient,
  options: NotificationWorkerOptions = {},
): Promise<NotificationWorkerResult> {
  const limit = integerInRange(options.limit, 25, 1, 100);
  const leaseSeconds = integerInRange(options.leaseSeconds, 120, 30, 900);
  const maxAttempts = integerInRange(options.maxAttempts, 5, 1, 20);
  const workerId = options.workerId?.trim() || `task5-d-${randomUUID()}`;

  if (workerId.length < 3 || workerId.length > 128) {
    throw new Error("notification_worker_invalid_worker_id");
  }

  const leaseResult = await client.rpc("lease_notification_outbox", {
    p_worker_id: workerId,
    p_limit: limit,
    p_lease_seconds: leaseSeconds,
    p_max_attempts: maxAttempts,
  });
  if (leaseResult.error) throw rpcError(leaseResult, "notification_lease_failed");

  const leases = Array.isArray(leaseResult.data) ? leaseResult.data as NotificationOutboxLease[] : [];
  const result: NotificationWorkerResult = {
    workerId,
    leased: leases.length,
    delivered: 0,
    failed: 0,
    dead: 0,
    errors: [],
  };

  for (const lease of leases) {
    const completion = await client.rpc("complete_notification_outbox", {
      p_outbox_id: lease.id,
      p_worker_id: workerId,
    });
    if (!completion.error) {
      result.delivered += 1;
      continue;
    }

    const code = normalizeNotificationFailureCode(completion.error.code || "notification_delivery_failed");
    const failure = await client.rpc("fail_notification_outbox", {
      p_outbox_id: lease.id,
      p_worker_id: workerId,
      p_error_code: code,
      p_max_attempts: maxAttempts,
    });
    result.failed += 1;
    if (typeof failure.data === "object" && failure.data !== null && "dead" in failure.data && failure.data.dead === true) result.dead += 1;
    result.errors.push({
      outboxId: lease.id,
      code: failure.error ? "notification_failure_record_failed" : code,
    });
  }

  return result;
}
