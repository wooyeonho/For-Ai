import { createClient } from "@supabase/supabase-js";
import { getAllRegistryBundles } from "./data";
import { documentPageUrl } from "./urls";
import { isValidRfc3339Timestamp } from "./xml";

// Bible v7 section 9.1/9.3: the changelog surfaces claim-level status
// transitions, restricted to these three outcomes (not every raw
// verification_event type — "created"/"source_added"/etc. are not
// transitions a reader needs to see here).
export type ChangelogStatus = "verified" | "needs_review" | "disputed";

export const CHANGELOG_STATUSES: ChangelogStatus[] = ["verified", "needs_review", "disputed"];

export function isChangelogStatus(value: unknown): value is ChangelogStatus {
  return typeof value === "string" && (CHANGELOG_STATUSES as string[]).includes(value);
}

export type ChangelogEvent = {
  id: string;
  claim_id: string;
  document_slug: string;
  document_title: string;
  lang: string;
  field_path: string;
  status: ChangelogStatus;
  previous_status: string | null;
  occurred_at: string;
};

export type EventCursor = { occurredAt: string; id: string };

export function encodeEventCursor(cursor: EventCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeEventCursor(value: string | null | undefined): EventCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.occurredAt === "string" &&
      typeof parsed.id === "string" &&
      Number.isFinite(Date.parse(parsed.occurredAt))
    ) {
      return { occurredAt: parsed.occurredAt, id: parsed.id };
    }
  } catch {
    // fall through to null — an unparseable cursor is treated as "start over",
    // never as a request error (the changelog is a read-only discovery surface).
  }
  return null;
}

function normalizeStatus(newStatus: string | null | undefined): ChangelogStatus | null {
  if (newStatus === "verified" || newStatus === "needs_review" || newStatus === "disputed") return newStatus;
  return null;
}

// event_id sort is a pure string compare (bible's specified tie-breaker for
// same-timestamp events), independent of whatever ID scheme claims/events
// use — it only needs to be *stable*, not semantically ordered.
function compareEventsDesc(a: ChangelogEvent, b: ChangelogEvent): number {
  const byTime = Date.parse(b.occurred_at) - Date.parse(a.occurred_at);
  if (byTime !== 0) return byTime;
  return b.id.localeCompare(a.id);
}

// True when `event` sorts strictly after the cursor's anchor position in the
// same (created_at DESC, event_id DESC) order — i.e. it belongs on the next
// page.
function isBeforeCursor(event: ChangelogEvent, cursor: EventCursor): boolean {
  const eventTime = Date.parse(event.occurred_at);
  const cursorTime = Date.parse(cursor.occurredAt);
  if (eventTime !== cursorTime) return eventTime < cursorTime;
  return event.id.localeCompare(cursor.id) < 0;
}

// Computes each event's previous_status across the FULL, unfiltered event
// history for its claim before any status filter or pagination is applied —
// bible v7 section 9.1 step 1-2: "LAG 계산 -> transition filter -> status
// filter". Filtering claims/events first would make an event's "previous
// status" reflect only the filtered subset, not what the claim actually was.
function withComputedPreviousStatus(rawEvents: Array<ChangelogEvent & { rawStatus: ChangelogStatus | null }>): ChangelogEvent[] {
  const byClaim = new Map<string, Array<ChangelogEvent & { rawStatus: ChangelogStatus | null }>>();
  for (const event of rawEvents) {
    const bucket = byClaim.get(event.claim_id);
    if (bucket) bucket.push(event);
    else byClaim.set(event.claim_id, [event]);
  }

  const result: ChangelogEvent[] = [];
  for (const events of byClaim.values()) {
    events.sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at) || a.id.localeCompare(b.id));
    let previous: string | null = null;
    for (const event of events) {
      // Rebuilt explicitly (not `{ ...event, previous_status }`) so the
      // internal-only `rawStatus` field never leaks into the public
      // ChangelogEvent shape returned by the API/RSS/page surfaces.
      result.push({
        id: event.id,
        claim_id: event.claim_id,
        document_slug: event.document_slug,
        document_title: event.document_title,
        lang: event.lang,
        field_path: event.field_path,
        status: event.status,
        previous_status: previous,
        occurred_at: event.occurred_at,
      });
      if (event.rawStatus) previous = event.rawStatus;
    }
  }
  return result;
}

function staticEvents(): Array<ChangelogEvent & { rawStatus: ChangelogStatus | null }> {
  const events: Array<ChangelogEvent & { rawStatus: ChangelogStatus | null }> = [];
  for (const bundle of getAllRegistryBundles()) {
    for (const claim of bundle.claims) {
      for (const event of claim.verification_events) {
        if (!isValidRfc3339Timestamp(event.created_at)) continue;
        events.push({
          id: event.id,
          claim_id: claim.id,
          document_slug: bundle.document.slug,
          document_title: bundle.document.title,
          lang: bundle.document.lang,
          field_path: claim.field_path,
          status: normalizeStatus(event.new_status) ?? "needs_review",
          previous_status: null,
          occurred_at: event.created_at,
          rawStatus: normalizeStatus(event.new_status),
        });
      }
    }
  }
  return events;
}

type SupabaseEventRow = {
  id?: string | null;
  claim_id?: string | null;
  new_status?: string | null;
  created_at?: string | null;
  claims?: {
    field_path?: string | null;
    documents?: { slug?: string | null; title?: string | null; lang?: string | null } | null;
  } | null;
};

async function supabaseEvents(): Promise<Array<ChangelogEvent & { rawStatus: ChangelogStatus | null }>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];

  const supabase = createClient(url, key);
  const { data, error } = await supabase
    .from("verification_events")
    .select("id,claim_id,new_status,created_at,claims(field_path,documents(slug,title,lang))")
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error || !data) return [];

  return (data as unknown as SupabaseEventRow[]).flatMap((row) => {
    if (!row.id || !row.claim_id || !isValidRfc3339Timestamp(row.created_at)) return [];
    const rawStatus = normalizeStatus(row.new_status);
    return [
      {
        id: row.id,
        claim_id: row.claim_id,
        document_slug: row.claims?.documents?.slug ?? row.claim_id,
        document_title: row.claims?.documents?.title ?? row.claim_id,
        lang: row.claims?.documents?.lang ?? "en",
        field_path: row.claims?.field_path ?? "",
        status: rawStatus ?? "needs_review",
        previous_status: null,
        occurred_at: row.created_at,
        rawStatus,
      },
    ];
  });
}

export type GetRecentClaimStatusEventsOptions = {
  statuses?: ChangelogStatus[];
  limit: number;
  cursor?: EventCursor | null;
};

// Test-only: lets fixture-backed tests inject a small, deterministic raw
// event set instead of the full production registry + a live Supabase call
// (mirrors lib/check/candidates.ts's resetCandidateIndexForTests).
type RawChangelogEvent = ChangelogEvent & { rawStatus: ChangelogStatus | null };
let rawEventsOverrideForTests: RawChangelogEvent[] | null = null;

export function resetChangelogEventsForTesting(events: RawChangelogEvent[] | null): void {
  rawEventsOverrideForTests = events;
}

// Bible v7 section 9.1: LAG -> real-transition filter -> requested-status
// filter -> sort(created_at DESC, event_id DESC) -> limit/cursor, in that
// exact order. "Real transition" means previous_status !== the event's own
// status (a claim re-verified into the same status is not a transition).
export async function getRecentClaimStatusEvents(options: GetRecentClaimStatusEventsOptions): Promise<{
  events: ChangelogEvent[];
  nextCursor: string | null;
}> {
  const limit = Math.min(Math.max(Math.floor(options.limit) || 1, 1), 100);
  const allRaw = rawEventsOverrideForTests ?? [...(await supabaseEvents()), ...staticEvents()];
  const withPrevious = withComputedPreviousStatus(allRaw);

  const transitions = withPrevious.filter((event) => event.previous_status !== event.status);
  const statusFiltered = options.statuses?.length
    ? transitions.filter((event) => options.statuses!.includes(event.status))
    : transitions;

  const sorted = statusFiltered.sort(compareEventsDesc);

  const cursor = options.cursor;
  const afterCursor = cursor ? sorted.filter((event) => isBeforeCursor(event, cursor)) : sorted;

  const page = afterCursor.slice(0, limit);
  const last = page[page.length - 1];
  const nextCursor = last && afterCursor.length > limit ? encodeEventCursor({ occurredAt: last.occurred_at, id: last.id }) : null;

  return { events: page, nextCursor };
}

export function changelogEventUrl(event: ChangelogEvent): string {
  return documentPageUrl(event.document_slug, event.lang);
}
