import assert from "node:assert/strict";
import test from "node:test";
import { compareEvents, computeStatusTransitions, type ChangelogEvent, type RawStatusEvent } from "../lib/changelog";
import type { ClaimStatus } from "../lib/types";

function event(overrides: Partial<RawStatusEvent> & { id: string; claimId: string; newStatus: ClaimStatus; occurredAt: string }): RawStatusEvent {
  return {
    slug: "example-doc",
    title: "Example doc",
    lang: "en",
    entityId: "entity-1",
    fieldPath: "fee.base",
    eventType: "status_changed",
    note: null,
    ...overrides,
  };
}

function byId(transitions: ChangelogEvent[], id: string): ChangelogEvent {
  const found = transitions.find((t) => t.id === id);
  assert.ok(found, `expected a transition with id ${id}`);
  return found as ChangelogEvent;
}

test("LAG ordering: previousStatus reflects the immediately preceding status for that claim", () => {
  const events: RawStatusEvent[] = [
    event({ id: "e1", claimId: "c1", newStatus: "needs_review", occurredAt: "2026-07-01T00:00:00Z" }),
    event({ id: "e2", claimId: "c1", newStatus: "verified", occurredAt: "2026-07-02T00:00:00Z" }),
    event({ id: "e3", claimId: "c1", newStatus: "disputed", occurredAt: "2026-07-03T00:00:00Z" }),
  ];
  const transitions = computeStatusTransitions(events);
  assert.equal(transitions.length, 3);
  assert.equal(byId(transitions, "e1").previousStatus, null);
  assert.equal(byId(transitions, "e2").previousStatus, "needs_review");
  assert.equal(byId(transitions, "e3").previousStatus, "verified");
});

test("a no-op re-write of the same status is not a transition", () => {
  const events: RawStatusEvent[] = [
    event({ id: "e1", claimId: "c1", newStatus: "disputed", occurredAt: "2026-07-01T00:00:00Z" }),
    event({ id: "e2", claimId: "c1", newStatus: "disputed", occurredAt: "2026-07-02T00:00:00Z" }),
  ];
  const transitions = computeStatusTransitions(events);
  assert.equal(transitions.length, 1);
  assert.equal(transitions[0].id, "e1");
});

test("status filter is applied after LAG: a filtered-out earlier event still determines previousStatus", () => {
  const events: RawStatusEvent[] = [
    event({ id: "e1", claimId: "c1", newStatus: "needs_review", occurredAt: "2026-07-01T00:00:00Z" }),
    event({ id: "e2", claimId: "c1", newStatus: "verified", occurredAt: "2026-07-02T00:00:00Z" }),
  ];
  const verifiedOnly = computeStatusTransitions(events).filter((t) => t.newStatus === "verified");
  assert.equal(verifiedOnly.length, 1);
  // previousStatus is "needs_review" (from the full stream), not lost by filtering to verified-only.
  assert.equal(verifiedOnly[0].previousStatus, "needs_review");
});

test("same-timestamp tie-breaker: event id ordering decides LAG sequence deterministically", () => {
  const events: RawStatusEvent[] = [
    event({ id: "b-event", claimId: "c1", newStatus: "verified", occurredAt: "2026-07-01T00:00:00Z" }),
    event({ id: "a-event", claimId: "c1", newStatus: "needs_review", occurredAt: "2026-07-01T00:00:00Z" }),
  ];
  // "a-event" sorts before "b-event" lexically, so it is treated as occurring
  // first within the tied timestamp, making it the predecessor of b-event.
  const transitions = computeStatusTransitions(events);
  assert.equal(transitions.length, 2);
  assert.equal(byId(transitions, "a-event").previousStatus, null);
  assert.equal(byId(transitions, "b-event").previousStatus, "needs_review");
});

test("UTC day boundary: events just before/after midnight UTC keep their own timestamps for grouping", () => {
  const events: RawStatusEvent[] = [
    event({ id: "e1", claimId: "c1", newStatus: "needs_review", occurredAt: "2026-07-01T23:59:59.000Z" }),
    event({ id: "e2", claimId: "c1", newStatus: "verified", occurredAt: "2026-07-02T00:00:01.000Z" }),
  ];
  const transitions = computeStatusTransitions(events);
  const dayOf = (iso: string) => new Date(iso).toISOString().slice(0, 10);
  assert.equal(dayOf(byId(transitions, "e1").occurredAt), "2026-07-01");
  assert.equal(dayOf(byId(transitions, "e2").occurredAt), "2026-07-02");
});

test("separate claims never mix LAG state", () => {
  const events: RawStatusEvent[] = [
    event({ id: "e1", claimId: "c1", newStatus: "verified", occurredAt: "2026-07-01T00:00:00Z" }),
    event({ id: "e2", claimId: "c2", newStatus: "disputed", occurredAt: "2026-07-01T00:00:01Z" }),
  ];
  const transitions = computeStatusTransitions(events);
  assert.equal(transitions.length, 2);
  assert.ok(transitions.every((t) => t.previousStatus === null));
});

test("final sort step: created_at DESC, event_id DESC with a same-timestamp tie-breaker", () => {
  const base: Omit<ChangelogEvent, "id" | "occurredAt"> = {
    claimId: "c1", slug: "s", title: "t", lang: "en", entityId: "e", fieldPath: "f",
    eventType: "status_changed", previousStatus: null, newStatus: "verified", note: null, source: "static",
  };
  const older: ChangelogEvent = { ...base, id: "e1", occurredAt: "2026-07-01T00:00:00Z" };
  const newer: ChangelogEvent = { ...base, id: "e2", occurredAt: "2026-07-02T00:00:00Z" };
  const tieA: ChangelogEvent = { ...base, id: "a-tie", occurredAt: "2026-07-02T00:00:00Z" };
  const tieB: ChangelogEvent = { ...base, id: "b-tie", occurredAt: "2026-07-02T00:00:00Z" };

  const sorted = [older, newer].sort(compareEvents);
  assert.deepEqual(sorted.map((e) => e.id), ["e2", "e1"]);

  const tieSorted = [tieA, tieB].sort(compareEvents);
  assert.deepEqual(tieSorted.map((e) => e.id), ["b-tie", "a-tie"]);
});
