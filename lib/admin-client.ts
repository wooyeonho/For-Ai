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

export const ADMIN_MUTATION_HEADERS = {
  "Content-Type": "application/json",
  "x-admin-csrf": "1",
};
