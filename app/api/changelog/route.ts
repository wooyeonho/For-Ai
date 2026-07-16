import { NextResponse } from "next/server";
import { decodeEventCursor, getRecentClaimStatusEvents, isChangelogStatus, type ChangelogStatus } from "../../../lib/changelog";

// Bible v7 section 9.1: GET /api/changelog?status=verified&status=disputed&limit=50&cursor=...
// Mirrors getRecentClaimStatusEvents's contract directly — this route is a
// thin, cache-friendly wrapper, not a separate query path.
export const revalidate = 600;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawStatuses = url.searchParams.getAll("status");
  const statuses = rawStatuses.filter(isChangelogStatus) as ChangelogStatus[];

  const limitParam = Number(url.searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(limitParam) ? limitParam : 50;
  const cursor = decodeEventCursor(url.searchParams.get("cursor"));

  const { events, nextCursor } = await getRecentClaimStatusEvents({
    statuses: statuses.length ? statuses : undefined,
    limit,
    cursor,
  });

  return NextResponse.json(
    { events, nextCursor, limit: Math.min(Math.max(Math.floor(limit) || 1, 1), 100) },
    { headers: { "cache-control": "public, max-age=600, s-maxage=600" } },
  );
}
