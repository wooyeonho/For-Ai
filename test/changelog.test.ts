import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeEventCursor,
  encodeEventCursor,
  getRecentClaimStatusEvents,
  isChangelogStatus,
  resetChangelogEventsForTesting,
  type ChangelogStatus,
} from "../lib/changelog";

type RawFixtureEvent = {
  id: string;
  claim_id: string;
  document_slug: string;
  document_title: string;
  lang: string;
  field_path: string;
  status: ChangelogStatus;
  previous_status: null;
  occurred_at: string;
  rawStatus: ChangelogStatus | null;
};

function event(overrides: Partial<RawFixtureEvent> & { id: string; claim_id: string; occurred_at: string; rawStatus: ChangelogStatus | null }): RawFixtureEvent {
  return {
    document_slug: "example-fact",
    document_title: "Example fact",
    lang: "en",
    field_path: "fee.amount",
    status: overrides.rawStatus ?? "needs_review",
    previous_status: null,
    ...overrides,
  };
}

test.afterEach(() => {
  resetChangelogEventsForTesting(null);
});

test("LAG ordering: previous_status reflects the claim's own event history, computed before filters", async () => {
  resetChangelogEventsForTesting([
    event({ id: "e1", claim_id: "c1", occurred_at: "2026-01-01T00:00:00Z", rawStatus: "needs_review" }),
    event({ id: "e2", claim_id: "c1", occurred_at: "2026-01-02T00:00:00Z", rawStatus: "verified" }),
    event({ id: "e3", claim_id: "c1", occurred_at: "2026-01-03T00:00:00Z", rawStatus: "disputed" }),
  ]);

  const { events } = await getRecentClaimStatusEvents({ limit: 100 });
  const byId = Object.fromEntries(events.map((e) => [e.id, e]));

  assert.equal(byId.e1.previous_status, null);
  assert.equal(byId.e2.previous_status, "needs_review");
  assert.equal(byId.e3.previous_status, "verified");
});

test("returned events never leak the internal rawStatus field used for LAG computation", async () => {
  resetChangelogEventsForTesting([event({ id: "e1", claim_id: "c1", occurred_at: "2026-01-01T00:00:00Z", rawStatus: "verified" })]);
  const { events } = await getRecentClaimStatusEvents({ limit: 100 });
  assert.deepEqual(Object.keys(events[0]).sort(), [
    "claim_id",
    "document_slug",
    "document_title",
    "field_path",
    "id",
    "lang",
    "occurred_at",
    "previous_status",
    "status",
  ]);
});

test("same-status re-verification is not a transition and is excluded from results", async () => {
  resetChangelogEventsForTesting([
    event({ id: "e1", claim_id: "c1", occurred_at: "2026-01-01T00:00:00Z", rawStatus: "verified" }),
    event({ id: "e2", claim_id: "c1", occurred_at: "2026-01-02T00:00:00Z", rawStatus: "verified" }), // re-verified, same status
  ]);

  const { events } = await getRecentClaimStatusEvents({ limit: 100 });
  assert.deepEqual(
    events.map((e) => e.id),
    ["e1"],
  );
});

test("status filter is applied after LAG computation, so previous_status is unaffected by the filter", async () => {
  resetChangelogEventsForTesting([
    event({ id: "e1", claim_id: "c1", occurred_at: "2026-01-01T00:00:00Z", rawStatus: "needs_review" }),
    event({ id: "e2", claim_id: "c1", occurred_at: "2026-01-02T00:00:00Z", rawStatus: "verified" }),
  ]);

  const { events } = await getRecentClaimStatusEvents({ statuses: ["verified"], limit: 100 });
  assert.equal(events.length, 1);
  assert.equal(events[0].id, "e2");
  // Still "needs_review" even though that status was itself filtered out of the result set.
  assert.equal(events[0].previous_status, "needs_review");
});

test("same-timestamp events are ordered deterministically by event_id descending", async () => {
  resetChangelogEventsForTesting([
    event({ id: "a", claim_id: "c1", occurred_at: "2026-01-01T00:00:00Z", rawStatus: "verified" }),
    event({ id: "z", claim_id: "c2", occurred_at: "2026-01-01T00:00:00Z", rawStatus: "verified" }),
    event({ id: "m", claim_id: "c3", occurred_at: "2026-01-01T00:00:00Z", rawStatus: "verified" }),
  ]);

  const { events } = await getRecentClaimStatusEvents({ limit: 100 });
  assert.deepEqual(
    events.map((e) => e.id),
    ["z", "m", "a"],
  );
});

test("cursor pagination resumes without duplicating or skipping events", async () => {
  resetChangelogEventsForTesting([
    event({ id: "e1", claim_id: "c1", occurred_at: "2026-01-01T00:00:00Z", rawStatus: "verified" }),
    event({ id: "e2", claim_id: "c2", occurred_at: "2026-01-02T00:00:00Z", rawStatus: "verified" }),
    event({ id: "e3", claim_id: "c3", occurred_at: "2026-01-03T00:00:00Z", rawStatus: "verified" }),
  ]);

  const page1 = await getRecentClaimStatusEvents({ limit: 2 });
  assert.deepEqual(page1.events.map((e) => e.id), ["e3", "e2"]);
  assert.ok(page1.nextCursor);

  const page2 = await getRecentClaimStatusEvents({ limit: 2, cursor: decodeEventCursor(page1.nextCursor) });
  assert.deepEqual(page2.events.map((e) => e.id), ["e1"]);
  assert.equal(page2.nextCursor, null);
});

test("decodeEventCursor treats malformed cursors as start-over, not an error", () => {
  assert.equal(decodeEventCursor("not-base64-json"), null);
  assert.equal(decodeEventCursor(null), null);
  assert.equal(decodeEventCursor(undefined), null);
  assert.equal(decodeEventCursor(Buffer.from(JSON.stringify({ occurredAt: "bad-date", id: "x" })).toString("base64url")), null);
});

test("encodeEventCursor / decodeEventCursor round-trip", () => {
  const cursor = { occurredAt: "2026-07-15T00:00:00.000Z", id: "evt-123" };
  assert.deepEqual(decodeEventCursor(encodeEventCursor(cursor)), cursor);
});

test("isChangelogStatus rejects raw verification_event types that are not changelog transitions", () => {
  assert.equal(isChangelogStatus("verified"), true);
  assert.equal(isChangelogStatus("needs_review"), true);
  assert.equal(isChangelogStatus("disputed"), true);
  assert.equal(isChangelogStatus("created"), false);
  assert.equal(isChangelogStatus("source_added"), false);
  assert.equal(isChangelogStatus(123), false);
});
