import "server-only";

import { createHash } from "crypto";
import type { Claim } from "./types";
import { REPORT_BODY_MAX_BYTES } from "./task5-corrections";

export function claimVersionReference(claim: Pick<Claim,
  "id" | "claim_text" | "claim_value" | "updated_at" | "published_claim_version_id" | "current_claim_version_id"
>): string {
  const databaseVersion = claim.published_claim_version_id ?? claim.current_claim_version_id;
  if (databaseVersion) return databaseVersion;

  const canonical = JSON.stringify({
    id: claim.id,
    claim_text: claim.claim_text,
    claim_value: claim.claim_value,
    updated_at: claim.updated_at ?? null,
  });
  return `static-sha256:${createHash("sha256").update(canonical).digest("hex")}`;
}

export async function readBoundedJsonObject(
  request: Request,
  maxBytes: number = REPORT_BODY_MAX_BYTES,
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; error: "body_too_large" | "invalid_json" }> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return { ok: false, error: "body_too_large" };
  }

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    return { ok: false, error: "body_too_large" };
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, error: "invalid_json" };
    }
    return { ok: true, body: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, error: "invalid_json" };
  }
}
