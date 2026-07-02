import test from "node:test";
import assert from "node:assert/strict";

process.env.ADMIN_SECRET = "test-admin-secret";
process.env.ADMIN_CSRF_SECRET = "test-csrf-token";

async function adminModules() {
  const adminApi = await import("../lib/admin-api");
  const loginRoute = await import("../app/api/admin/login/route");
  return { requireAdmin: adminApi.requireAdmin, loginPost: loginRoute.POST };
}

function adminRequest(headers: HeadersInit = {}, method = "POST"): Request {
  return new Request("https://for-ai.example/api/admin/posts", {
    method,
    headers: {
      host: "for-ai.example",
      ...headers,
    },
  });
}

async function assertAllowed(request: Request) {
  const { requireAdmin } = await adminModules();
  const response = await requireAdmin(request, "admin.import");
  assert.equal(response, null);
}

async function assertRejected(request: Request, status: number, error: string) {
  const { requireAdmin } = await adminModules();
  const response = await requireAdmin(request, "admin.import");
  assert.ok(response);
  assert.equal(response.status, status);
  assert.deepEqual(await response.json(), { error });
}

// Logs in and returns the raw `name=value` pair for a cookie set on the
// response, so callers can reconstruct a real browser `Cookie` request header
// (login sets two: the httpOnly session cookie and the JS-readable, signed
// double-submit CSRF cookie).
async function loginAndGetCookie(name: string): Promise<string> {
  const { loginPost } = await adminModules();
  const loginResponse = await loginPost(new Request("https://for-ai.example/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json", host: "for-ai.example" },
    body: JSON.stringify({ password: "test-admin-secret" }),
  }));
  assert.equal(loginResponse.status, 200);
  const setCookieHeaders = loginResponse.headers.getSetCookie();
  const match = setCookieHeaders.find((entry) => entry.startsWith(`${name}=`));
  assert.ok(match, `expected a Set-Cookie for ${name}`);
  return match.split(";")[0];
}

test("cookie session authentication succeeds for same-origin admin requests with a valid double-submit CSRF token", async () => {
  const sessionCookie = await loginAndGetCookie("for_ai_admin_session");
  const csrfCookie = await loginAndGetCookie("for_ai_admin_csrf");
  const csrfToken = csrfCookie.slice(csrfCookie.indexOf("=") + 1);

  await assertAllowed(adminRequest({
    cookie: `${sessionCookie}; ${csrfCookie}`,
    "x-admin-csrf": csrfToken,
    origin: "https://for-ai.example",
  }));
});

test("cookie session authentication with a forged CSRF header is rejected", async () => {
  const sessionCookie = await loginAndGetCookie("for_ai_admin_session");
  const csrfCookie = await loginAndGetCookie("for_ai_admin_csrf");

  // Header doesn't match the signed cookie token — the double-submit check
  // must reject even though the session cookie itself is valid.
  await assertRejected(adminRequest({
    cookie: `${sessionCookie}; ${csrfCookie}`,
    "x-admin-csrf": "attacker-supplied-token",
    origin: "https://for-ai.example",
  }), 403, "csrf_failed");
});

test("browser-origin x-admin-secret requests are rejected (reserved for CLI/server-to-server callers)", async () => {
  await assertRejected(adminRequest({
    "x-admin-secret": "test-admin-secret",
    "x-admin-csrf": "test-csrf-token",
    origin: "https://for-ai.example",
  }), 403, "browser_admin_secret_forbidden");

  await assertRejected(adminRequest({
    "x-admin-secret": "test-admin-secret",
    "x-admin-csrf": "test-csrf-token",
    "sec-fetch-site": "same-origin",
  }), 403, "browser_admin_secret_forbidden");
});

test("CLI/internal x-admin-secret requests are allowed", async () => {
  await assertAllowed(adminRequest({
    "x-admin-secret": "test-admin-secret",
  }));
});

test("admin requests fail when CSRF validation fails", async () => {
  const sessionCookie = await loginAndGetCookie("for_ai_admin_session");

  // Same-origin browser request authenticated via the session cookie, but
  // missing the CSRF cookie/header entirely.
  await assertRejected(adminRequest({
    cookie: sessionCookie,
    origin: "https://for-ai.example",
  }), 403, "csrf_failed");
});
