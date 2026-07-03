import test from "node:test";
import assert from "node:assert/strict";
import * as clientConstants from "../lib/submission-constants";
import * as serverLimits from "../lib/submission-limits";

// Client forms import lib/submission-constants while server routes import
// lib/submission-limits. The limits module must re-export the constants module
// verbatim — if the values are ever re-duplicated and drift, client-side
// validation and server-side enforcement silently disagree.
test("server submission limits re-export the client-safe constants unchanged", () => {
  const limits = serverLimits as Record<string, unknown>;
  for (const [name, value] of Object.entries(clientConstants)) {
    assert.deepEqual(
      limits[name],
      value,
      `lib/submission-limits.${name} drifted from lib/submission-constants`,
    );
  }
});
