"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AdminSecretField, useAdminSecret } from "../AdminSecretProvider";

type ApiTier = "free" | "pro" | "enterprise";

type ApiKeyRow = {
  id: string;
  profile_id: string | null;
  key_prefix: string;
  name: string;
  tier: ApiTier;
  rate_limit_rpm: number;
  rate_limit_daily: number;
  scopes: string[];
  is_active: boolean;
  revoked_at: string | null;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
};

type UsageLog = {
  id: string;
  key_id: string | null;
  endpoint: string;
  status_code: number | null;
  created_at: string;
};

type AbuseWarning = {
  key_id: string;
  warning: string;
  severity: "warning" | "critical";
  count: number;
  last_seen_at: string | null;
};

type ApiResponse = {
  keys?: ApiKeyRow[];
  usage_logs?: UsageLog[];
  usage_by_key?: Record<string, { total: number; rate_limited: number; errors: number; last_used_at: string | null }>;
  abuse_warnings?: AbuseWarning[];
  error?: string;
};

const TIER_LABEL: Record<ApiTier, string> = { free: "Free", pro: "Pro", enterprise: "Enterprise" };
const TIER_LIMITS: Record<ApiTier, { rpm: number; daily: number }> = {
  free: { rpm: 60, daily: 1000 },
  pro: { rpm: 300, daily: 50000 },
  enterprise: { rpm: 1000, daily: 500000 },
};

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString("ko-KR") : "—";
}

function statusColor(status: number | null) {
  if (!status) return "#6b7280";
  if (status === 429) return "#9333ea";
  if (status >= 500) return "#b91c1c";
  if (status >= 400) return "#d97706";
  return "#15803d";
}

export default function AdminApiKeysPage() {
  const { adminSecret, setAdminSecret, resetAdminSecret } = useAdminSecret();
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [usageLogs, setUsageLogs] = useState<UsageLog[]>([]);
  const [usageByKey, setUsageByKey] = useState<ApiResponse["usage_by_key"]>({});
  const [abuseWarnings, setAbuseWarnings] = useState<AbuseWarning[]>([]);
  const [selectedKeyId, setSelectedKeyId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [rawKey, setRawKey] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", profile_id: "", tier: "free" as ApiTier, scopes: "read" });

  const selectedLogs = useMemo(() => usageLogs.filter((log) => !selectedKeyId || log.key_id === selectedKeyId).slice(0, 50), [usageLogs, selectedKeyId]);
  const warningsByKey = useMemo(() => new Map(abuseWarnings.map((warning) => [warning.key_id, warning])), [abuseWarnings]);

  function flash(text: string, ok = true) {
    setMessage({ text, ok });
    setTimeout(() => setMessage(null), 4500);
  }

  const load = useCallback(async () => {
    if (!adminSecret) return;
    setLoading(true);
    try {
      const res = await fetch("/api/keys?usage_limit=500", { headers: { "x-admin-secret": adminSecret } });
      const payload: ApiResponse = await res.json();
      if (!res.ok) {
        flash(payload.error ?? "API key 조회 실패", false);
      } else {
        setKeys(payload.keys ?? []);
        setUsageLogs(payload.usage_logs ?? []);
        setUsageByKey(payload.usage_by_key ?? {});
        setAbuseWarnings(payload.abuse_warnings ?? []);
      }
    } catch {
      flash("네트워크 오류", false);
    }
    setLoading(false);
  }, [adminSecret]);

  useEffect(() => { load(); }, [load]);

  async function createKey(event: React.FormEvent) {
    event.preventDefault();
    if (!adminSecret) return flash("admin secret을 입력하세요", false);
    setCreating(true);
    setRawKey(null);
    const tierDefaults = TIER_LIMITS[form.tier];
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-secret": adminSecret, "x-admin-csrf": "1" },
        body: JSON.stringify({
          name: form.name,
          profile_id: form.profile_id || null,
          tier: form.tier,
          scopes: form.scopes.split(",").map((scope) => scope.trim()).filter(Boolean),
          rate_limit_rpm: tierDefaults.rpm,
          rate_limit_daily: tierDefaults.daily,
        }),
      });
      const payload = await res.json();
      if (res.ok) {
        setRawKey(payload.raw_key);
        setForm((current) => ({ ...current, name: "" }));
        flash("API key가 발급되었습니다. 원문 key를 지금 복사하세요.");
        load();
      } else flash(payload.error ?? "발급 실패", false);
    } catch {
      flash("네트워크 오류", false);
    }
    setCreating(false);
  }

  async function updateKey(key: ApiKeyRow, updates: Record<string, unknown>) {
    if (!adminSecret) return flash("admin secret을 입력하세요", false);
    const res = await fetch("/api/keys", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-secret": adminSecret, "x-admin-csrf": "1" },
      body: JSON.stringify({ key_id: key.id, ...updates }),
    });
    const payload = await res.json();
    if (res.ok) {
      flash("API key 설정이 저장되었습니다.");
      load();
    } else flash(payload.error ?? "저장 실패", false);
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f9fafb", padding: 24, fontFamily: "sans-serif" }}>
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <p style={{ margin: "0 0 4px", color: "#2563eb", fontSize: 12, fontWeight: 700 }}>For-Ai · Admin</p>
            <h1 style={{ margin: 0, fontSize: 24 }}>API key 관리</h1>
            <p style={{ margin: "6px 0 0", color: "#6b7280", fontSize: 13 }}>발급, 비활성화, plan/tier 설정, usage logs, abuse warning을 관리합니다.</p>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <AdminSecretField adminSecret={adminSecret} setAdminSecret={setAdminSecret} resetAdminSecret={resetAdminSecret} label="관리자 인증키" placeholder="admin secret" inputStyle={{ border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 10px", fontSize: 13, width: 160 }} />
            <Link href="/admin" style={{ color: "#2563eb", fontSize: 13 }}>관리 홈</Link>
          </div>
        </header>

        {message && <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8, background: message.ok ? "#f0fdf4" : "#fef2f2", border: `1px solid ${message.ok ? "#bbf7d0" : "#fecaca"}`, fontSize: 13 }}>{message.text}</div>}
        {rawKey && <section style={{ marginBottom: 16, padding: 16, border: "1px solid #fde68a", borderRadius: 10, background: "#fffbeb" }}><strong>새 API key — 한 번만 표시됩니다.</strong><code style={{ display: "block", marginTop: 8, padding: 12, borderRadius: 8, background: "#111827", color: "#f9fafb", overflowWrap: "anywhere" }}>{rawKey}</code></section>}

        <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 18, marginBottom: 18 }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>Key 발급</h2>
          <form onSubmit={createKey} style={{ display: "grid", gridTemplateColumns: "minmax(180px, 1fr) minmax(180px, 1fr) 150px minmax(160px, 1fr) auto", gap: 10, alignItems: "end" }}>
            <label style={{ fontSize: 12, fontWeight: 700 }}>이름<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Production citation API" style={{ display: "block", width: "100%", marginTop: 4, padding: 8, border: "1px solid #d1d5db", borderRadius: 6 }} /></label>
            <label style={{ fontSize: 12, fontWeight: 700 }}>Business profile ID (선택)<input value={form.profile_id} onChange={(event) => setForm({ ...form, profile_id: event.target.value })} placeholder="verified_business_profiles.id" style={{ display: "block", width: "100%", marginTop: 4, padding: 8, border: "1px solid #d1d5db", borderRadius: 6 }} /></label>
            <label style={{ fontSize: 12, fontWeight: 700 }}>Plan/Tier<select value={form.tier} onChange={(event) => setForm({ ...form, tier: event.target.value as ApiTier })} style={{ display: "block", width: "100%", marginTop: 4, padding: 8, border: "1px solid #d1d5db", borderRadius: 6 }}>{Object.entries(TIER_LABEL).map(([tier, label]) => <option key={tier} value={tier}>{label}</option>)}</select></label>
            <label style={{ fontSize: 12, fontWeight: 700 }}>Scopes<input value={form.scopes} onChange={(event) => setForm({ ...form, scopes: event.target.value })} placeholder="read,write" style={{ display: "block", width: "100%", marginTop: 4, padding: 8, border: "1px solid #d1d5db", borderRadius: 6 }} /></label>
            <button disabled={creating} style={{ padding: "9px 16px", border: "none", borderRadius: 8, background: creating ? "#9ca3af" : "#2563eb", color: "#fff", fontWeight: 700 }}>{creating ? "발급 중" : "발급"}</button>
          </form>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 18, alignItems: "start" }}>
          <div>
            <h2 style={{ fontSize: 18 }}>Keys {loading && <span style={{ color: "#9ca3af", fontSize: 13 }}>로딩 중...</span>}</h2>
            {keys.length === 0 ? <div style={{ padding: 40, textAlign: "center", color: "#9ca3af", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12 }}>API key가 없습니다.</div> : keys.map((key) => {
              const stats = usageByKey?.[key.id];
              const warning = warningsByKey.get(key.id);
              return <article key={key.id} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div><strong>{key.name}</strong> <code style={{ color: "#6b7280" }}>{key.key_prefix}…</code><p style={{ margin: "6px 0 0", fontSize: 12, color: "#6b7280" }}>created {formatDate(key.created_at)} · last used {formatDate(key.last_used_at)}</p></div>
                  <span style={{ height: 24, padding: "3px 10px", borderRadius: 999, background: key.is_active ? "#dcfce7" : "#fee2e2", color: key.is_active ? "#15803d" : "#b91c1c", fontSize: 12, fontWeight: 700 }}>{key.is_active ? "active" : "inactive"}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "150px 120px 140px 1fr", gap: 10, marginTop: 14, alignItems: "end" }}>
                  <label style={{ fontSize: 12, fontWeight: 700 }}>Tier<select defaultValue={key.tier} onChange={(event) => updateKey(key, { tier: event.target.value })} style={{ display: "block", width: "100%", marginTop: 4, padding: 7, border: "1px solid #d1d5db", borderRadius: 6 }}>{Object.entries(TIER_LABEL).map(([tier, label]) => <option key={tier} value={tier}>{label}</option>)}</select></label>
                  <div style={{ fontSize: 12 }}><b>{key.rate_limit_rpm}</b> rpm<br /><b>{key.rate_limit_daily}</b> / day</div>
                  <button onClick={() => updateKey(key, { is_active: !key.is_active })} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #d1d5db", background: key.is_active ? "#fff7ed" : "#f0fdf4", color: key.is_active ? "#c2410c" : "#15803d", fontWeight: 700 }}>{key.is_active ? "비활성화" : "재활성화"}</button>
                  <button onClick={() => setSelectedKeyId(key.id)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #bfdbfe", background: selectedKeyId === key.id ? "#dbeafe" : "#eff6ff", color: "#1d4ed8", fontWeight: 700 }}>usage logs 보기</button>
                </div>
                <p style={{ margin: "12px 0 0", fontSize: 12, color: "#6b7280" }}>최근 24시간 usage: {stats?.total ?? 0} · rate limit: {stats?.rate_limited ?? 0} · errors: {stats?.errors ?? 0}</p>
                {warning && <p style={{ margin: "8px 0 0", padding: 8, borderRadius: 8, background: warning.severity === "critical" ? "#fef2f2" : "#fffbeb", color: warning.severity === "critical" ? "#b91c1c" : "#92400e", fontSize: 12 }}>⚠️ {warning.warning} ({warning.count})</p>}
              </article>;
            })}
          </div>

          <aside>
            <h2 style={{ fontSize: 18 }}>Abuse warnings</h2>
            <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 14, marginBottom: 18 }}>
              {abuseWarnings.length === 0 ? <p style={{ margin: 0, color: "#6b7280", fontSize: 13 }}>최근 24시간 warning이 없습니다.</p> : abuseWarnings.map((warning) => <div key={`${warning.key_id}-${warning.warning}`} style={{ padding: "8px 0", borderBottom: "1px solid #f3f4f6" }}><b style={{ color: warning.severity === "critical" ? "#b91c1c" : "#92400e" }}>{warning.severity}</b><p style={{ margin: "4px 0", fontSize: 13 }}>{warning.warning}</p><code style={{ fontSize: 11 }}>{warning.key_id.slice(0, 8)} · {warning.count} · {formatDate(warning.last_seen_at)}</code></div>)}
            </div>
            <h2 style={{ fontSize: 18 }}>Usage logs</h2>
            <select value={selectedKeyId} onChange={(event) => setSelectedKeyId(event.target.value)} style={{ width: "100%", marginBottom: 8, padding: 8, border: "1px solid #d1d5db", borderRadius: 6 }}><option value="">전체 key</option>{keys.map((key) => <option key={key.id} value={key.id}>{key.name} ({key.key_prefix}…)</option>)}</select>
            <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 14, maxHeight: 520, overflow: "auto" }}>
              {selectedLogs.length === 0 ? <p style={{ margin: 0, color: "#6b7280", fontSize: 13 }}>usage event가 없습니다.</p> : selectedLogs.map((log) => <div key={log.id} style={{ padding: "8px 0", borderBottom: "1px solid #f3f4f6" }}><code style={{ color: statusColor(log.status_code), fontWeight: 700 }}>{log.status_code ?? "—"}</code> <span style={{ fontSize: 12 }}>{log.endpoint}</span><br /><span style={{ color: "#9ca3af", fontSize: 11 }}>{formatDate(log.created_at)}</span></div>)}
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
