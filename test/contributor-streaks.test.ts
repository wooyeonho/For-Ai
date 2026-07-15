import assert from "node:assert/strict";
import test from "node:test";
import { calculateContributorStreaks, streakMilestoneProgress, type ContributionEvent } from "../lib/contributor-streaks";

test("calculates differentiated contributor streak rewards", () => {
  const events: ContributionEvent[] = [
    { contributor_hash: "c1", event_type: "visit", created_at: "2026-06-27T10:00:00Z" },
    { contributor_hash: "c1", event_type: "visit", created_at: "2026-06-28T10:00:00Z" },
    { contributor_hash: "c1", event_type: "visit", created_at: "2026-06-29T10:00:00Z" },
    { contributor_hash: "c1", event_type: "submission", created_at: "2026-06-28T11:00:00Z", submission_status: "new" },
    { contributor_hash: "c1", event_type: "submission", created_at: "2026-06-29T11:00:00Z", submission_status: "accepted" },
    { contributor_hash: "c1", event_type: "accepted_contribution", created_at: "2026-06-29T12:00:00Z" },
    { contributor_hash: "c1", event_type: "verified_source", created_at: "2026-06-29T13:00:00Z" },
  ];

  const summary = calculateContributorStreaks("c1", events, "2026-06-29T23:00:00Z");

  assert.equal(summary.streaks.visit.currentDays, 3);
  assert.equal(summary.streaks.submission.currentDays, 2);
  assert.equal(summary.streaks.accepted_contribution.currentDays, 1);
  assert.equal(summary.totalPoints, 33);
  assert.deepEqual(summary.badges, ["verified-source-contributor"]);
  assert.equal(summary.leaderboardScore, 1);
});

test("excludes rejected and spam submissions from submission streaks", () => {
  const events: ContributionEvent[] = [
    { contributor_hash: "c1", event_type: "submission", created_at: "2026-06-27T11:00:00Z", submission_status: "new" },
    { contributor_hash: "c1", event_type: "submission", created_at: "2026-06-28T11:00:00Z", submission_status: "rejected" },
    { contributor_hash: "c1", event_type: "submission", created_at: "2026-06-29T11:00:00Z", submission_status: "spam" },
  ];

  const summary = calculateContributorStreaks("c1", events, "2026-06-29T23:00:00Z");

  assert.equal(summary.streaks.submission.currentDays, 0);
  assert.equal(summary.streaks.submission.longestDays, 1);
  assert.equal(summary.totalPoints, 0);
});

test("streak milestone progress matches 3/7/30/100 boundaries", () => {
  assert.deepEqual(streakMilestoneProgress(0), { next: 3, progressPercent: 0, maxed: false });
  assert.deepEqual(streakMilestoneProgress(2), { next: 3, progressPercent: 67, maxed: false });
  assert.deepEqual(streakMilestoneProgress(3), { next: 7, progressPercent: 0, maxed: false });
  assert.deepEqual(streakMilestoneProgress(7), { next: 30, progressPercent: 0, maxed: false });
  assert.deepEqual(streakMilestoneProgress(8), { next: 30, progressPercent: 4, maxed: false });
  assert.deepEqual(streakMilestoneProgress(30), { next: 100, progressPercent: 0, maxed: false });
  assert.deepEqual(streakMilestoneProgress(100), { next: null, progressPercent: 100, maxed: true });
  assert.deepEqual(streakMilestoneProgress(101), { next: null, progressPercent: 100, maxed: true });
});
