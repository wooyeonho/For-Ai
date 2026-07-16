import { createClient } from "@supabase/supabase-js";
import { getAllRegistryBundles } from "./data";
import { isValidRfc3339Timestamp } from "./xml";
import type { ClaimStatus } from "./types";

// Task 4 changelog/RSS source. Bible v7 Book IV section 9.1 order, applied
// identically to both the static-bundle source and the Supabase RPC source:
//   1. LAG(status) over the FULL per-claim event stream
//   2. keep only real transitions (status actually changed)
//   3. THEN apply the caller's requested status filter
//   4. sort created_at DESC, event_id DESC
//   5. limit/cursor
//
// The requested status filter is never pushed down before step 1 — a
// document whose only visible transition (after filtering) is "verified"
// must still have had its FULL event history considered when computing
// what "previous status" means for that transition.

// Migration note (Bible v7 Book IV section 9.3 "build simplicity" allowance): both
// sources are fetched up to this cumulative cap, merged, and sliced in
// application code rather than via a single DB-level UNION+LAG+keyset query.
// This is correct as long as the total status-filtered transitions strictly
// older than a given cursor stay under the cap across BOTH sources combined.
// If either source's event volume approaches 300 in production, replace this
// with a real cross-source DB view (or move static bundle events into
// Supabase) so cursor pagination stays exact at scale.
export const CHANGELOG_HARD_CAP = 300;
export const CHANGELOG_DEFAULT_LIMIT = 50;

export type ChangelogEvent = {
  id: string;
  claimId: string;
  slug: string;
  title: string;
  lang: string;
  entityId: string;
  fieldPath: string;
  eventType: string;
  previousStatus: ClaimStatus | null;
  newStatus: ClaimStatus;
  note: string | null;
  occurredAt: string;
  source: "static" | "supabase";
};

export type ChangelogCursor = { occurredAt: string; eventId: string };

export type ChangelogQuery = {
  statuses?: ClaimStatus[];
  limit?: number;
  cursor?: ChangelogCursor | null;
};

function clampLimit(limit: number | undefined): number {
  const n = Number.isFinite(limit) ? Math.trunc(limit as number) : CHANGELOG_DEFAULT_LIMIT;
  return Math.min(Math.max(n, 1), CHANGELOG_HARD_CAP);
}

// Exported for direct testing of the final sort step (Bible v7 Book IV section 9.1
// step 4: "sort created_at DESC, event_id DESC"). computeStatusTransitions()
// itself does not guarantee this order — only getChangelogEvents's merged,
// sorted output does.
export function compareEvents(a: ChangelogEvent, b: ChangelogEvent): number {
  const at = Date.parse(a.occurredAt);
  const bt = Date.parse(b.occurredAt);
  if (at !== bt) return bt - at;
  return b.id.localeCompare(a.id);
}

// --- pure LAG-transition algorithm ------------------------------------------
// Exported and unit-tested directly (LAG ordering, same-timestamp tie-break,
// UTC boundary): mirrors the SQL RPC's window-function logic exactly, so both
// the static-bundle source and (if ever needed offline) any other in-app
// source apply the identical rule: full per-claim stream, ordered by
// (occurred_at, id), before any status filter.
export type RawStatusEvent = {
  id: string;
  claimId: string;
  slug: string;
  title: string;
  lang: string;
  entityId: string;
  fieldPath: string;
  eventType: string;
  newStatus: ClaimStatus;
  note: string | null;
  occurredAt: string;
};

export function computeStatusTransitions(events: RawStatusEvent[]): ChangelogEvent[] {
  const byClaim = new Map<string, RawStatusEvent[]>();
  for (const event of events) {
    const list = byClaim.get(event.claimId) ?? [];
    list.push(event);
    byClaim.set(event.claimId, list);
  }

  const transitions: ChangelogEvent[] = [];
  for (const claimEvents of byClaim.values()) {
    claimEvents.sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || a.id.localeCompare(b.id));
    let previous: ClaimStatus | null = null;
    for (const event of claimEvents) {
      if (previous === null || previous !== event.newStatus) {
        transitions.push({
          id: event.id,
          claimId: event.claimId,
          slug: event.slug,
          title: event.title,
          lang: event.lang,
          entityId: event.entityId,
          fieldPath: event.fieldPath,
          eventType: event.eventType,
          previousStatus: previous,
          newStatus: event.newStatus,
          note: event.note,
          occurredAt: event.occurredAt,
          source: "static",
        });
      }
      previous = event.newStatus;
    }
  }
  return transitions;
}

// --- static bundle source ---------------------------------------------------
// Static seed/verified-claims bundles carry their own verification_events
// arrays; computeStatusTransitions() applies the same LAG rule as the DB RPC.
function staticTransitionEvents(): ChangelogEvent[] {
  const rawEvents: RawStatusEvent[] = [];
  let invalidTimestampCount = 0;

  for (const bundle of getAllRegistryBundles()) {
    for (const claim of bundle.claims) {
      for (const event of claim.verification_events) {
        if (!event.new_status) continue;
        if (!isValidRfc3339Timestamp(event.created_at)) {
          invalidTimestampCount++;
          continue;
        }
        rawEvents.push({
          id: event.id,
          claimId: claim.id,
          slug: bundle.document.slug,
          title: bundle.document.title,
          lang: bundle.document.lang,
          entityId: bundle.entity.id,
          fieldPath: claim.field_path,
          eventType: event.event_type,
          newStatus: event.new_status,
          note: event.note ?? null,
          occurredAt: event.created_at as string,
        });
      }
    }
  }

  // Structured, privacy-safe warning: counts only, never event content.
  if (invalidTimestampCount > 0) {
    console.warn("[changelog] excluded status-bearing events with invalid created_at", {
      invalid_timestamp_event_count: invalidTimestampCount,
    });
  }

  return computeStatusTransitions(rawEvents);
}

// --- Supabase RPC source -----------------------------------------------------
type RpcRow = {
  event_id: string;
  claim_id: string;
  event_type: string;
  previous_status: ClaimStatus | null;
  new_status: ClaimStatus;
  note: string | null;
  occurred_at: string;
  slug: string;
  title: string;
  lang: string;
  entity_id: string;
  field_path: string;
};

async function supabaseTransitionEvents(query: ChangelogQuery): Promise<ChangelogEvent[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];

  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.rpc("get_claim_status_transition_events", {
    p_statuses: query.statuses?.length ? query.statuses : null,
    // The RPC does its own status filter AFTER LAG, so requesting the full
    // hard cap here (rather than the caller's page-sized limit) keeps
    // pagination correct once results are merged with the static source.
    p_limit: CHANGELOG_HARD_CAP,
    p_before_created_at: query.cursor?.occurredAt ?? null,
    p_before_event_id: query.cursor?.eventId ?? null,
  });
  if (error || !data) return [];

  return (data as RpcRow[])
    .filter((row) => isValidRfc3339Timestamp(row.occurred_at))
    .map((row) => ({
      id: row.event_id,
      claimId: row.claim_id,
      slug: row.slug,
      title: row.title,
      lang: row.lang,
      entityId: row.entity_id,
      fieldPath: row.field_path,
      eventType: row.event_type,
      previousStatus: row.previous_status,
      newStatus: row.new_status,
      note: row.note,
      occurredAt: row.occurred_at,
      source: "supabase" as const,
    }));
}

export async function getChangelogEvents(query: ChangelogQuery = {}): Promise<ChangelogEvent[]> {
  const limit = clampLimit(query.limit);
  const [supabaseEvents, staticEvents] = await Promise.all([
    supabaseTransitionEvents(query),
    Promise.resolve(staticTransitionEvents()),
  ]);

  const merged = [...supabaseEvents, ...staticEvents]
    .filter((event) => !query.statuses?.length || query.statuses.includes(event.newStatus))
    .sort(compareEvents);

  const cursor = query.cursor;
  const afterCursor = cursor
    ? merged.filter((event) => {
        const eventTime = Date.parse(event.occurredAt);
        const cursorTime = Date.parse(cursor.occurredAt);
        if (eventTime !== cursorTime) return eventTime < cursorTime;
        return event.id.localeCompare(cursor.eventId) < 0;
      })
    : merged;

  return afterCursor.slice(0, limit);
}

export function nextChangelogCursor(events: ChangelogEvent[]): ChangelogCursor | null {
  const last = events[events.length - 1];
  return last ? { occurredAt: last.occurredAt, eventId: last.id } : null;
}
