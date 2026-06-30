"use client";

import Link from "next/link";
import { FormEvent, useCallback, useMemo, useState } from "react";
import { AdminSecretField, useAdminSecret } from "../AdminSecretProvider";

type ApiUsageEvent = { endpoint: string; status_code: number | null; created_at: string };
type ManagedApiKey = {
  id: string;
  profile_id: string | null;
  key_prefix: string;
  name: string;
  tier: "free" | "pro" | "enterprise";
  rate_limit_rpm: number;
  rate_limit_daily: number;
  scopes: string[];
  is_active: boolean;
  revoked_at: string | null;
  last_used_at: string | null;
  created_at: string;
  usage_24h?: { total24h: number; errors24h: number; rateLimited24h: number; error_rate: number; last_events: ApiUsageEvent[] };
  abuse_warnings?: string[];
  warning_level?: "ok" | "warning";
};

type KeysPayload = { keys?: ManagedApiKey[]; usage_window_hours?: number };

const PAGE = { minHeight: "100vh", background: "#f9fafb", padding: "32px 20px", fontFamily: "sans-serif" };
const WRAP = { maxWidth: 1180, margin: "0 auto" };
const PANEL = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 20 };
const INPUT = { width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 10, boxSizing: "border-box" as const };
const BUTTON = { padding: "10px 14px", border: 0, borderRadius: 10, background: "#111827", color: "#fff", fontWeight: 700, cursor: "pointer" };
const TIERS = ["free", "pro", "enterprise"] as const;

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("ko-KR") : "—";
}

function percent(value: number | undefined) {
  return `${(((value ?? 0) * 100)).toFixed(1)}%`;
}

export default function AdminApiKeysPage() {
  const { adminSecret, setAdminSecret, resetAdminSecret } = useAdminSecret();
  const [payload, setPayload] = useState<KeysPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [newKey, setNewKey] = useState<{ name: string; tier: ManagedApiKey["tier"]; profile_id: string }>({ name: "", tier: "free", profile_id: "" });
  const [rawKey, setRawKey] = useState<string | null>(null);

  const keys = useMemo(() => payload?.keys ?? [], [payload?.keys]);
  const warningCount = keys.filter((key) => (key.abuse_warnings?.length ?? 0) > 0).length;

  const loadKeys = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/keys", { headers: { "x-admin-secret": adminSecret } });
      const data = await res.json();
      setPayload(res.ok ? data : null);
      setMessage({ ok: res.ok, text: res.ok ? "API key 목록과 usage logs를 불러왔습니다." : data.error ?? "API key 조회 실패" });
    } catch {
      setMessage({ ok: false, text: "네트워크 오류" });
    } finally {
      setLoading(false);
    }
  }, [adminSecret]);

  async function createKey(event: FormEvent) {
    event.preventDefault();
    setRawKey(null);
    setLoading(true);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-secret": adminSecret },
        body: JSON.stringify({ name: newKey.name, tier: newKey.tier, profile_id: newKey.profile_id || null, scopes: ["read"] }),
      });
      const data = await res.json();
      setMessage({ ok: res.ok, text: res.ok ? "API key가 발급되었습니다. 원문 key를 지금 복사하세요." : data.error ?? "발급 실패" });
      if (res.ok) {
        setRawKey(data.raw_key);
        setNewKey({ name: "", tier: "free", profile_id: "" });
        await loadKeys();
      }
    } catch {
      setMessage({ ok: false, text: "네트워크 오류" });
    } finally {
      setLoading(false);
    }
  }

  async function updateKey(key_id: string, update: Record<string, unknown>) {
    setLoading(true);
    try {
      const res = await fetch("/api/keys", {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-admin-secret": adminSecret },
        body: JSON.stringify({ key_id, ...update }),
      });
      const data = await res.json();
      setMessage({ ok: res.ok, text: res.ok ? "API key 설정이 업데이트되었습니다." : data.error ?? "업데이트 실패" });
      if (res.ok) await loadKeys();
    } catch {
      setMessage({ ok: false, text: "네트워크 오류" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={PAGE}>
      <main style={WRAP}>
        <header style={{ ...PANEL, marginBottom: 18 }}>
          <Link href="/admin" style={{ color: "#2563eb", fontSize: 13, fontWeight: 700 }}>← Admin dashboard</Link>
          <h1 style={{ margin: "10px 0 6px", fontSize: 30 }}>API key management</h1>
          <p style={{ color: "#4b5563", lineHeight: 1.6, maxWidth: 820 }}>
            운영자가 직접 API key를 발급·비활성화하고 plan/tier를 변경합니다. 최근 24시간 API usage events와 연결해 고사용량, 높은 오류율, rate limit 발생 key에 abuse warning을 표시합니다.
          </p>
          <AdminSecretField adminSecret={adminSecret} setAdminSecret={setAdminSecret} resetAdminSecret={resetAdminSecret} inputStyle={INPUT} />
          <div style={{ display: "flex", gap: 10, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={loadKeys} disabled={loading} style={{ ...BUTTON, cursor: loading ? "not-allowed" : "pointer" }}>{loading ? "처리 중..." : "API keys 불러오기"}</button>
            <span style={{ color: warningCount ? "#b45309" : "#047857", fontWeight: 700 }}>Warnings: {warningCount}</span>
          </div>
          {message && <p style={{ color: message.ok ? "#166534" : "#991b1b", marginBottom: 0 }}>{message.text}</p>}
        </header>

        <section style={{ ...PANEL, marginBottom: 18 }}>
          <h2 style={{ marginTop: 0 }}>신규 API key 발급</h2>
          <form onSubmit={createKey} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 2fr auto", gap: 10, alignItems: "end" }}>
            <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 700 }}>Key name<input required value={newKey.name} onChange={(event) => setNewKey((prev) => ({ ...prev, name: event.target.value }))} style={INPUT} placeholder="Partner citation API" /></label>
            <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 700 }}>Plan / tier<select value={newKey.tier} onChange={(event) => setNewKey((prev) => ({ ...prev, tier: event.target.value as ManagedApiKey["tier"] }))} style={INPUT}>{TIERS.map((tier) => <option key={tier}>{tier}</option>)}</select></label>
            <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 700 }}>Profile ID (optional)<input value={newKey.profile_id} onChange={(event) => setNewKey((prev) => ({ ...prev, profile_id: event.target.value }))} style={INPUT} placeholder="verified_business_profiles.id" /></label>
            <button type="submit" disabled={loading} style={BUTTON}>발급</button>
          </form>
          {rawKey && <div style={{ marginTop: 14, border: "1px solid #f59e0b", background: "#fffbeb", borderRadius: 12, padding: 14 }}><strong>Raw key — 한 번만 표시됩니다.</strong><code style={{ display: "block", marginTop: 8, wordBreak: "break-all" }}>{rawKey}</code></div>}
        </section>

        <section style={PANEL}>
          <h2 style={{ marginTop: 0 }}>API keys · usage logs · abuse warnings</h2>
          {keys.length === 0 ? <p style={{ color: "#6b7280" }}>ADMIN_SECRET으로 목록을 불러오면 key와 usage log가 표시됩니다.</p> : (
            <div style={{ display: "grid", gap: 12 }}>
              {keys.map((key) => (
                <article key={key.id} style={{ border: `1px solid ${(key.abuse_warnings?.length ?? 0) > 0 ? "#f59e0b" : "#e5e7eb"}`, borderRadius: 14, padding: 14, background: (key.abuse_warnings?.length ?? 0) > 0 ? "#fffbeb" : "#fff" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div><h3 style={{ margin: 0 }}>{key.name} <code style={{ fontSize: 13, color: "#6b7280" }}>{key.key_prefix}…</code></h3><p style={{ margin: "6px 0 0", color: "#6b7280", fontSize: 13 }}>created {formatDate(key.created_at)} · last used {formatDate(key.last_used_at)}</p></div>
                    <strong style={{ color: key.is_active ? "#047857" : "#dc2626" }}>{key.is_active ? "Active" : "Inactive"}</strong>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginTop: 12, fontSize: 13 }}>
                    <span>24h requests: <strong>{key.usage_24h?.total24h ?? 0}</strong></span><span>Errors: <strong>{key.usage_24h?.errors24h ?? 0}</strong></span><span>Error rate: <strong>{percent(key.usage_24h?.error_rate)}</strong></span><span>429s: <strong>{key.usage_24h?.rateLimited24h ?? 0}</strong></span><span>RPM: <strong>{key.rate_limit_rpm}</strong></span><span>Daily: <strong>{key.rate_limit_daily}</strong></span>
                  </div>
                  {(key.abuse_warnings?.length ?? 0) > 0 && <ul style={{ color: "#92400e", fontWeight: 700 }}>{key.abuse_warnings?.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
                    <select value={key.tier} onChange={(event) => updateKey(key.id, { tier: event.target.value })} disabled={loading} style={{ ...INPUT, width: 180 }}>{TIERS.map((tier) => <option key={tier}>{tier}</option>)}</select>
                    <button onClick={() => updateKey(key.id, { revoke: key.is_active })} disabled={loading} style={{ ...BUTTON, background: key.is_active ? "#dc2626" : "#047857" }}>{key.is_active ? "비활성화" : "재활성화"}</button>
                  </div>
                  <details style={{ marginTop: 12 }}><summary style={{ cursor: "pointer", fontWeight: 700 }}>최근 usage logs</summary>{(key.usage_24h?.last_events.length ?? 0) === 0 ? <p style={{ color: "#6b7280" }}>최근 24시간 usage event가 없습니다.</p> : <ul>{key.usage_24h?.last_events.map((event) => <li key={`${event.created_at}-${event.endpoint}`}>{formatDate(event.created_at)} · {event.endpoint} · HTTP {event.status_code ?? "—"}</li>)}</ul>}</details>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
