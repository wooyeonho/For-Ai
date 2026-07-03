import assert from 'node:assert/strict';
import test from 'node:test';

import { buildLeaderboardRows, LEADERBOARD_QUALITY_EVENTS } from '../lib/gamification-leaderboard';

test('pending official URL submissions do not affect leaderboard score', () => {
  const repeatedPendingOfficialSubmissions = Array.from({ length: 12 }, () => [
    {
      contributor_hash: 'pending-official-submitter',
      event_type: 'source_submitted',
      points: 5,
    },
    {
      contributor_hash: 'pending-official-submitter',
      event_type: 'official_source_bonus',
      points: 5,
    },
  ]).flat();

  const rows = buildLeaderboardRows([
    ...repeatedPendingOfficialSubmissions,
    {
      contributor_hash: 'accepted-review-contributor',
      event_type: 'source_accepted',
      points: 30,
    },
  ]);

  assert.deepEqual(rows, [
    {
      rank: 1,
      contributor_hash: 'accepted-review-contributor',
      quality_points: 30,
    },
  ]);
});

test('official source quality credit is acceptance-time only', () => {
  assert.equal(LEADERBOARD_QUALITY_EVENTS.has('official_source_bonus'), false);
  assert.equal(LEADERBOARD_QUALITY_EVENTS.has('official_source_accepted_bonus'), true);

  const rows = buildLeaderboardRows([
    {
      contributor_hash: 'accepted-official-source-hunter',
      event_type: 'source_accepted',
      points: 30,
    },
    {
      contributor_hash: 'accepted-official-source-hunter',
      event_type: 'official_source_accepted_bonus',
      points: 5,
    },
  ]);

  assert.equal(rows[0]?.quality_points, 35);
});
