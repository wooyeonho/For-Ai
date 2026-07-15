import assert from "node:assert/strict";
import test from "node:test";

function streakRequest(): Request {
  return new Request("https://for-ai.example/api/contributions/streak", {
    headers: { host: "for-ai.example", "x-forwarded-for": "203.0.113.5" },
  });
}

test("returns { streak: null } when the Supabase service role is not configured", async () => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    const { GET } = await import("../app/api/contributions/streak/route");
    const response = await GET(streakRequest());
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { streak: null });
    assert.equal(response.headers.get("cache-control"), "no-store");
  } finally {
    if (previousUrl !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousServiceKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = previousServiceKey;
  }
});

test("returns { streak: null } when CONTRIBUTOR_SALT is missing (no derivable contributor identity)", async () => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const previousSalt = process.env.CONTRIBUTOR_SALT;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  delete process.env.CONTRIBUTOR_SALT;

  try {
    const { GET } = await import("../app/api/contributions/streak/route");
    const response = await GET(streakRequest());
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { streak: null });
  } finally {
    if (previousUrl !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    else delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (previousServiceKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = previousServiceKey;
    else delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (previousSalt !== undefined) process.env.CONTRIBUTOR_SALT = previousSalt;
  }
});
