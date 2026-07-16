import { NextResponse } from "next/server";
import { CHANGELOG_HARD_CAP, getChangelogEvents, nextChangelogCursor, type ChangelogCursor } from "../../../lib/changelog";
import type { ClaimStatus } from "../../../lib/types";

export const revalidate = 600;

const VALID_STATUSES = new Set<ClaimStatus>(["verified", "needs_review", "disputed", "unknown"]);

function parseStatuses(url: URL): ClaimStatus[] | undefined {
  const raw = url.searchParams.getAll("status");
  if (raw.length === 0) return undefined;
  const statuses = raw.filter((value): value is ClaimStatus => VALID_STATUSES.has(value as ClaimStatus));
  return statuses.length > 0 ? statuses : undefined;
}

// Explicit validation: an unparseable/absent limit falls back to the
// default; it never silently degrades into NaN/empty results.
function parseLimit(url: URL): number {
  const raw = url.searchParams.get("limit");
  if (raw === null) return 50;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 50;
  return Math.min(Math.max(Math.trunc(n), 1), CHANGELOG_HARD_CAP);
}

function parseCursor(url: URL): { cursor?: ChangelogCursor; error?: string } {
  const raw = url.searchParams.get("cursor");
  if (!raw) return {};
  try {
    const decoded = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (
      decoded && typeof decoded === "object" &&
      typeof decoded.occurredAt === "string" && typeof decoded.eventId === "string" &&
      Number.isFinite(Date.parse(decoded.occurredAt))
    ) {
      return { cursor: { occurredAt: decoded.occurredAt, eventId: decoded.eventId } };
    }
    return { error: "invalid_cursor" };
  } catch {
    return { error: "invalid_cursor" };
  }
}

function encodeCursor(cursor: ChangelogCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const statuses = parseStatuses(url);
  const limit = parseLimit(url);
  const { cursor, error } = parseCursor(url);
  if (error) {
    return NextResponse.json({ error }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const items = await getChangelogEvents({ statuses, limit, cursor });
  const next = items.length === limit ? nextChangelogCursor(items) : null;

  return NextResponse.json(
    {
      items: items.map((event) => ({
        event_id: event.id,
        claim_id: event.claimId,
        slug: event.slug,
        title: event.title,
        lang: event.lang,
        entity_id: event.entityId,
        field_path: event.fieldPath,
        event_type: event.eventType,
        previous_status: event.previousStatus,
        new_status: event.newStatus,
        note: event.note,
        occurred_at: event.occurredAt,
      })),
      limit,
      next_cursor: next ? encodeCursor(next) : null,
      lag_policy: "LAG(status) computed over the full per-claim event stream before the transition filter and any requested status filter",
    },
    { headers: { "Cache-Control": "public, max-age=600, s-maxage=600" } },
  );
}
