"use client";

import type { CSSProperties, FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AdminSecretField, useAdminSecret } from "../AdminSecretProvider";

type Placement = {
  id: string;
  profile_id: string;
  entity_id: string;
  placement_type: "category_featured" | "search_promoted" | "related_entity";
  category: string | null;
  display_label: string;
  target_url: string | null;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  verified_business_profiles?: { business_name?: string; status?: string } | null;
};

type PlacementForm = {
  id: string;
  profile_id: string;
  entity_id: string;
  placement_type: Placement["placement_type"];
  category: string;
  display_label: string;
  target_url: string;
  is_active: boolean;
  starts_at: string;
  ends_at: string;
};

const emptyForm: PlacementForm = {
  id: "",
  profile_id: "",
  entity_id: "",
  placement_type: "category_featured",
  category: "",
  display_label: "Sponsored",
  target_url: "",
  is_active: false,
  starts_at: "",
  ends_at: "",
};

export default function AdminSponsoredPage() {
  const { adminSecret, setAdminSecret, resetAdminSecret } = useAdminSecret();
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const editing = Boolean(form.id);

  const flash = (text: string, ok = true) => {
    setMessage({ text, ok });
    setTimeout(() => setMessage(null), 4000);
  };

  const load = useCallback(async () => {
    if (!adminSecret) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/sponsored", { headers: { "x-admin-secret": adminSecret } });
      const payload = await res.json();
      setPlacements(Array.isArray(payload.placements) ? payload.placements : []);
      if (!res.ok) flash(payload.error ?? "조회 실패", false);
    } catch {
      flash("네트워크 오류", false);
    } finally {
      setLoading(false);
    }
  }, [adminSecret]);

  useEffect(() => { load(); }, [load]);

  function setField(name: string, value: string | boolean) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function editPlacement(p: Placement) {
    setForm({
      id: p.id,
      profile_id: p.profile_id,
      entity_id: p.entity_id,
      placement_type: p.placement_type,
      category: p.category ?? "",
      display_label: p.display_label,
      target_url: p.target_url ?? "",
      is_active: p.is_active,
      starts_at: p.starts_at ?? "",
      ends_at: p.ends_at ?? "",
    });
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!adminSecret) { flash("admin secret을 입력하세요", false); return; }
    const method = editing ? "PATCH" : "POST";
    try {
      const res = await fetch("/api/admin/sponsored", {
        method,
        headers: { "Content-Type": "application/json", "x-admin-secret": adminSecret, "x-admin-csrf": "1" },
        body: JSON.stringify(form),
      });
      const payload = await res.json();
      if (!res.ok) { flash(payload.error ?? "저장 실패", false); return; }
      flash(editing ? "Sponsored placement 수정 완료" : "Sponsored placement 생성 완료");
      setForm(emptyForm);
      load();
    } catch {
      flash("네트워크 오류", false);
    }
  }

  async function setActive(p: Placement, isActive: boolean) {
    const res = await fetch("/api/admin/sponsored", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-secret": adminSecret, "x-admin-csrf": "1" },
      body: JSON.stringify({ ...p, is_active: isActive }),
    });
    const payload = await res.json();
    if (res.ok) { flash(isActive ? "활성화 완료" : "비활성화 완료"); load(); }
    else flash(payload.error ?? "상태 변경 실패", false);
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f9fafb", padding: 24, fontFamily: "sans-serif" }}>
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <header style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 20, marginBottom: 16 }}>
          <p style={{ margin: 0, color: "#6b7280", fontSize: 12, fontWeight: 700, textTransform: "uppercase" }}>Monetization guardrail</p>
          <h1 style={{ margin: "6px 0" }}>Sponsored placements</h1>
          <p style={{ color: "#4b5563", maxWidth: 820 }}>
            스폰서 콘텐츠는 생성·수정·비활성화만 관리하며, claim verification status와 분리됩니다. Public UI에는 항상 <strong>Sponsored</strong> label이 표시됩니다.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <AdminSecretField adminSecret={adminSecret} setAdminSecret={setAdminSecret} resetAdminSecret={resetAdminSecret} label="관리자 인증키" placeholder="admin secret" inputStyle={{ border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 10px" }} />
            <button onClick={load} disabled={loading} style={{ padding: "9px 14px", border: 0, borderRadius: 8, background: "#111827", color: "#fff", fontWeight: 700 }}>{loading ? "로딩 중..." : "새로고침"}</button>
            <Link href="/admin" style={{ color: "#2563eb", fontWeight: 700 }}>Admin home →</Link>
          </div>
          {message && <p style={{ color: message.ok ? "#166534" : "#991b1b" }}>{message.text}</p>}
        </header>

        <section style={{ display: "grid", gridTemplateColumns: "minmax(320px, 420px) 1fr", gap: 16, alignItems: "start" }}>
          <form onSubmit={save} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 18, display: "grid", gap: 10 }}>
            <h2 style={{ margin: 0 }}>{editing ? "Placement 수정" : "Placement 생성"}</h2>
            <label>Business profile ID<input value={form.profile_id} onChange={(e) => setField("profile_id", e.target.value)} required style={input} /></label>
            <label>Entity ID<input value={form.entity_id} onChange={(e) => setField("entity_id", e.target.value)} required style={input} /></label>
            <label>Placement type<select value={form.placement_type} onChange={(e) => setField("placement_type", e.target.value)} style={input}><option value="category_featured">category_featured</option><option value="search_promoted">search_promoted</option><option value="related_entity">related_entity</option></select></label>
            <label>Category<input value={form.category} onChange={(e) => setField("category", e.target.value)} style={input} /></label>
            <label>Display label<input value={form.display_label} onChange={(e) => setField("display_label", e.target.value)} required style={input} /></label>
            <label>Target URL<input value={form.target_url} onChange={(e) => setField("target_url", e.target.value)} style={input} /></label>
            <label>Starts at<input value={form.starts_at} onChange={(e) => setField("starts_at", e.target.value)} placeholder="2026-07-01T00:00:00Z" style={input} /></label>
            <label>Ends at<input value={form.ends_at} onChange={(e) => setField("ends_at", e.target.value)} placeholder="2026-07-31T23:59:59Z" style={input} /></label>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={form.is_active} onChange={(e) => setField("is_active", e.target.checked)} /> Active</label>
            <div style={{ display: "flex", gap: 8 }}><button type="submit" style={primary}>{editing ? "수정" : "생성"}</button>{editing && <button type="button" onClick={() => setForm(emptyForm)} style={secondary}>취소</button>}</div>
            <p style={{ color: "#6b7280", fontSize: 12 }}>Guardrail: 이 폼은 sponsored_placements만 쓰며 claims, claim_sources, verification_events를 수정하지 않습니다.</p>
          </form>

          <div style={{ display: "grid", gap: 10 }}>
            {placements.length === 0 ? <div style={panel}>Sponsored placements가 없습니다.</div> : placements.map((p) => (
              <article key={p.id} style={panel}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div><strong>{p.display_label}</strong><p style={{ margin: "4px 0", color: "#4b5563" }}>{p.verified_business_profiles?.business_name ?? p.profile_id} · {p.entity_id}</p></div>
                  <span style={{ height: 24, borderRadius: 999, padding: "3px 10px", background: p.is_active ? "#dcfce7" : "#f3f4f6", color: p.is_active ? "#166534" : "#6b7280", fontSize: 12, fontWeight: 700 }}>{p.is_active ? "active" : "inactive"}</span>
                </div>
                <p style={{ fontSize: 13, color: "#6b7280" }}>{p.placement_type} {p.category ? `· ${p.category}` : ""} {p.target_url ? `· ${p.target_url}` : ""}</p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button onClick={() => editPlacement(p)} style={secondary}>수정</button>{p.is_active ? <button onClick={() => setActive(p, false)} style={danger}>비활성화</button> : <button onClick={() => setActive(p, true)} style={primary}>활성화</button>}</div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

const input: CSSProperties = { width: "100%", marginTop: 4, padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 8 };
const primary: CSSProperties = { padding: "8px 14px", border: 0, borderRadius: 8, background: "#2563eb", color: "#fff", fontWeight: 700, cursor: "pointer" };
const secondary: CSSProperties = { padding: "8px 14px", border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", color: "#374151", fontWeight: 700, cursor: "pointer" };
const danger: CSSProperties = { padding: "8px 14px", border: 0, borderRadius: 8, background: "#dc2626", color: "#fff", fontWeight: 700, cursor: "pointer" };
const panel: CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 16 };
