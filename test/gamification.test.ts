import assert from "node:assert/strict";
import test from "node:test";
import { awardPoints, POINT_VALUES } from "../lib/point-awards";

type PointEvent = {
  contributor_hash: string;
  event_type: string;
  points: number;
  reference_id: string | null;
  reference_type: string | null;
  metadata: Record<string, unknown>;
};

function createFakeSupabasePointLedger() {
  const events: PointEvent[] = [];
  const calls: { table: string; onConflict?: string }[] = [];

  return {
    events,
    calls,
    from(table: string) {
      assert.equal(table, "contributor_point_events");
      return {
        upsert(row: PointEvent, options: { onConflict: string; ignoreDuplicates: boolean }) {
          calls.push({ table, onConflict: options.onConflict });
          const conflictColumns = options.onConflict.split(",").map((column) => column.trim()) as (keyof PointEvent)[];
          const duplicate = events.some((event) =>
            conflictColumns.every((column) => event[column] === row[column])
          );
          const inserted = !duplicate || !options.ignoreDuplicates;
          if (inserted) events.push(row);
          return {
            select() {
              return {
                async maybeSingle() {
                  return { data: inserted ? { id: `event-${events.length}` } : null, error: null };
                },
              };
            },
          };
        },
      };
    },
  };
}

test("awardPoints de-duplicates duplicate hallucination report rewards by report id", async () => {
  const sb = createFakeSupabasePointLedger();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await awardPoints(
      sb as never,
      "contributor-1",
      "hallucination_reported",
      POINT_VALUES.hallucination_reported,
      {
        referenceType: "hallucination_report",
        referenceId: "report-123",
        metadata: { slug: "myungdong-laluce-parking", attempt },
      }
    );
  }

  assert.equal(sb.events.length, 1);
  assert.deepEqual(sb.events[0], {
    contributor_hash: "contributor-1",
    event_type: "hallucination_reported",
    points: POINT_VALUES.hallucination_reported,
    reference_id: "report-123",
    reference_type: "hallucination_report",
    metadata: { slug: "myungdong-laluce-parking", attempt: 0 },
  });
  assert.equal(
    sb.calls[0].onConflict,
    "contributor_hash,event_type,reference_type,reference_id"
  );
});

test("gamification migration uniquely keys point events by contributor, event, reference type, and reference id", async () => {
  const { readFile } = await import("node:fs/promises");
  const migration = await readFile("supabase/migrations/20260702_gamification_tables_and_rls.sql", "utf8");

  assert.match(
    migration,
    /create unique index contributor_point_events_idem_idx\s+on contributor_point_events \(contributor_hash, event_type, reference_type, reference_id\)/
  );
});
