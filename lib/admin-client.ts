export async function ensureAdminSession(password: string): Promise<void> {
  const trimmed = password.trim();
  if (!trimmed) throw new Error("admin password is required");

  const res = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ password: trimmed }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "admin login failed");
  }
}

const ADMIN_CSRF_COOKIE = "for_ai_admin_csrf";

// Read the JS-readable double-submit CSRF token that /api/admin/login sets.
// Returns "" on the server or before login; requests then fail server-side
// CSRF validation rather than silently sending a stale/placeholder token.
export function readAdminCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const entry = document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${ADMIN_CSRF_COOKIE}=`));
  return entry ? decodeURIComponent(entry.slice(ADMIN_CSRF_COOKIE.length + 1)) : "";
}

// Central header builder for admin mutations. Always attaches the CSRF token;
// callers pass any extras (e.g. x-admin-secret, x-admin-actor).
export function adminMutationHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-admin-csrf": readAdminCsrfToken(),
    ...(extra ?? {}),
  };
}
