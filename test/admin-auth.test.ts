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

test("cookie session authentication succeeds for same-origin admin requests with CSRF", async () => {
  const { loginPost } = await adminModules();
  const loginResponse = await loginPost(new Request("https://for-ai.example/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json", host: "for-ai.example" },
    body: JSON.stringify({ password: "test-admin-secret" }),
  }));

  assert.equal(loginResponse.status, 200);
  const setCookie = loginResponse.headers.get("set-cookie");
  assert.match(setCookie ?? "", /for_ai_admin_session=/);
  const sessionCookie = setCookie?.split(";")[0] ?? "";

  await assertAllowed(adminRequest({
    cookie: sessionCookie,
    "x-admin-csrf": "test-csrf-token",
    origin: "https://for-ai.example",
  }));
});

test("browser-origin x-admin-secret requests are rejected", async () => {
  await assertRejected(adminRequest({
    "x-admin-secret": "test-admin-secret",
    "x-admin-csrf": "test-csrf-token",
    origin: "https://for-ai.example",
  }), 401, "unauthorized");

  await assertRejected(adminRequest({
    "x-admin-secret": "test-admin-secret",
    "x-admin-csrf": "test-csrf-token",
    "sec-fetch-site": "same-origin",
  }), 401, "unauthorized");
});

test("CLI/internal x-admin-secret requests are allowed", async () => {
  await assertAllowed(adminRequest({
    "x-admin-secret": "test-admin-secret",
    "x-admin-csrf": "test-csrf-token",
  }));
});

test("admin requests fail when CSRF validation fails", async () => {
  await assertRejected(adminRequest({
    "x-admin-secret": "test-admin-secret",
  }), 403, "csrf_failed");
});
