"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AdminSecretField, useAdminSecret } from "../AdminSecretProvider";

type ApiKeyRow = { id: string; profile_id: string | null; key_prefix: string; name: string; tier: string; rate_limit_rpm: number; rate_limit_daily: number; scopes: string[]; is_active: boolean; revoked_at: string | null; last_used_at: string | null; created_at: string; usage?: { requests_30d: number; last_status: number | null; last_seen_at: string | null } };

export default function AdminApiKeysPage() {
  const { adminSecret, setAdminSecret, resetAdminSecret } = useAdminSecret();
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [rawKey, setRawKey] = useState("");
  const [form, setForm] = useState({ name: "", profile_id: "", tier: "free", scopes: "read" });

  const load = useCallback(async () => {
    if (!adminSecret) return;
    const res = await fetch("/api/keys", { headers: { "x-admin-secret": adminSecret } });
    const json = await res.json();
    if (!res.ok) return setMsg({ ok: false, text: json.error ?? "Load failed" });
    setKeys(json.keys ?? []);
  }, [adminSecret]);

  useEffect(() => { void load(); }, [load]);

  async function createKey() {
    setRawKey("");
    const res = await fetch("/api/keys", { method: "POST", headers: { "Content-Type": "application/json", "x-admin-secret": adminSecret, "x-admin-csrf": "1" }, body: JSON.stringify({ name: form.name, profile_id: form.profile_id || null, tier: form.tier, scopes: form.scopes.split(",").map((scope) => scope.trim()).filter(Boolean) }) });
    const json = await res.json();
    setMsg({ ok: res.ok, text: res.ok ? "API key issued. Copy it now; it will not be shown again." : json.error ?? "Create failed" });
    if (res.ok) { setRawKey(json.raw_key); setForm({ ...form, name: "" }); await load(); }
  }

  async function setRevoked(key_id: string, revoke: boolean) {
    const res = await fetch("/api/keys", { method: "PATCH", headers: { "Content-Type": "application/json", "x-admin-secret": adminSecret, "x-admin-csrf": "1" }, body: JSON.stringify({ key_id, revoke }) });
    const json = await res.json();
    setMsg({ ok: res.ok, text: res.ok ? (revoke ? "API key disabled" : "API key re-enabled") : json.error ?? "Update failed" });
    if (res.ok) await load();
  }

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24, display: "grid", gap: 18 }}>
      <Link href="/admin">← Admin</Link>
      <h1>API key operations</h1>
      <p style={{ color: "#4b5563" }}>Issue API keys, disable/re-enable access, and review recent usage counts from the API usage log.</p>
      <AdminSecretField adminSecret={adminSecret} setAdminSecret={setAdminSecret} resetAdminSecret={resetAdminSecret} />
      {msg && <div style={{ padding: 12, borderRadius: 10, background: msg.ok ? "#dcfce7" : "#fee2e2", color: msg.ok ? "#166534" : "#991b1b" }}>{msg.text}</div>}
      {rawKey && <div style={{ padding: 14, border: "2px solid #f59e0b", borderRadius: 12, background: "#fffbeb" }}><strong>New raw key (copy now):</strong><pre style={{ whiteSpace: "pre-wrap" }}>{rawKey}</pre></div>}
      <section style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 16, display: "grid", gap: 10 }}>
        <h2>Issue key</h2>
        <input placeholder="Key name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={{ padding: 10 }} />
        <input placeholder="Business profile UUID (optional)" value={form.profile_id} onChange={(e) => setForm({ ...form, profile_id: e.target.value })} style={{ padding: 10 }} />
        <select value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value })} style={{ padding: 10 }}><option value="free">free</option><option value="pro">pro</option><option value="enterprise">enterprise</option></select>
        <input placeholder="Scopes, comma-separated" value={form.scopes} onChange={(e) => setForm({ ...form, scopes: e.target.value })} style={{ padding: 10 }} />
        <button onClick={() => void createKey()} disabled={!adminSecret || !form.name.trim()} style={{ padding: 10, borderRadius: 8 }}>Issue API key</button>
      </section>
      <section style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 16 }}>
        <h2>Keys and usage</h2>
        <button onClick={() => void load()} disabled={!adminSecret} style={{ padding: 8, borderRadius: 8 }}>Refresh usage</button>
        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["Name", "Prefix", "Tier", "Status", "Limits", "30d usage", "Last use", "Actions"].map((h) => <th key={h} style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: 8 }}>{h}</th>)}</tr></thead>
            <tbody>{keys.map((key) => <tr key={key.id}>
              <td style={{ padding: 8 }}>{key.name}<br /><small>{key.profile_id ?? "no profile"}</small></td>
              <td style={{ padding: 8 }}><code>{key.key_prefix}</code></td>
              <td style={{ padding: 8 }}>{key.tier}</td>
              <td style={{ padding: 8 }}>{key.is_active ? "active" : "disabled"}</td>
              <td style={{ padding: 8 }}>{key.rate_limit_rpm}/min · {key.rate_limit_daily}/day</td>
              <td style={{ padding: 8 }}>{key.usage?.requests_30d ?? 0} requests<br /><small>last status {key.usage?.last_status ?? "—"}</small></td>
              <td style={{ padding: 8 }}>{key.last_used_at ?? key.usage?.last_seen_at ?? "—"}</td>
              <td style={{ padding: 8 }}><button onClick={() => void setRevoked(key.id, key.is_active)}>{key.is_active ? "disable" : "re-enable"}</button></td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
