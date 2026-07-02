"use client";
import { readAdminCsrfToken } from "@/lib/admin-client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminSecretField, useAdminSecret } from "../AdminSecretProvider";

type Profile = { id: string; entity_id: string; business_name: string; business_email?: string; business_url?: string | null; country: string; industry?: string | null; tier: string; status: string; verification_method?: string; verification_review_url?: string | null; created_at?: string };
type Correction = { id: string; profile_id: string; entity_id: string; claim_id?: string | null; field_path: string; current_value?: string | null; proposed_value: string; reason: string; source_url?: string | null; priority: string; status: string; created_at?: string; verified_business_profiles?: { business_name?: string; tier?: string } };
type BusinessClaim = { id: string; profile_id: string; entity_id: string; document_id?: string | null; conflicts_with_claim_id?: string | null; field_path: string; claim_text: string; claim_value: string; source_url?: string | null; status: string; citation_ready: boolean; created_at?: string; verified_business_profiles?: { business_name?: string; tier?: string } };

type Message = { ok: boolean; text: string };

const card: React.CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, marginBottom: 12 };
const button: React.CSSProperties = { border: "none", borderRadius: 8, padding: "8px 12px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" };
const mono: React.CSSProperties = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12, background: "#f3f4f6", borderRadius: 6, padding: "2px 6px" };

export default function AdminBusinessPage() {
  const { adminSecret, setAdminSecret, resetAdminSecret } = useAdminSecret();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [claims, setClaims] = useState<BusinessClaim[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  const headers = useCallback(() => ({ "x-admin-secret": adminSecret, "x-admin-csrf": readAdminCsrfToken(), "Content-Type": "application/json" }), [adminSecret]);

  const flash = (text: string, ok = true) => { setMessage({ text, ok }); setTimeout(() => setMessage(null), 4500); };

  const load = useCallback(async () => {
    if (!adminSecret) return;
    setLoading(true);
    const [profileRes, correctionRes, claimRes] = await Promise.all([
      fetch("/api/business/profile?status=pending", { headers: { "x-admin-secret": adminSecret } }),
      fetch("/api/business/corrections?status=new", { headers: { "x-admin-secret": adminSecret } }),
      fetch("/api/business/submitted-claims?status=pending_verification", { headers: { "x-admin-secret": adminSecret } }),
    ]);
    const [profileData, correctionData, claimData] = await Promise.all([profileRes.json(), correctionRes.json(), claimRes.json()]);
    setProfiles(Array.isArray(profileData.profiles) ? profileData.profiles : []);
    setCorrections(Array.isArray(correctionData.corrections) ? correctionData.corrections : []);
    setClaims(Array.isArray(claimData.claims) ? claimData.claims : []);
    setLoading(false);
    if (!profileRes.ok || !correctionRes.ok || !claimRes.ok) flash(profileData.error ?? correctionData.error ?? claimData.error ?? "business queue load failed", false);
  }, [adminSecret]);

  useEffect(() => { load(); }, [load]);

  async function patch(url: string, body: Record<string, unknown>) {
    if (!adminSecret) { flash("admin secret을 입력하세요", false); return; }
    const res = await fetch(url, { method: "PATCH", headers: headers(), body: JSON.stringify(body) });
    const data = await res.json();
    if (res.ok) { flash("처리되었습니다"); load(); } else flash(data.error ?? "처리 실패", false);
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", padding: 24, fontFamily: "sans-serif" }}>
      <main style={{ maxWidth: 1100, margin: "0 auto" }}>
        <nav style={{ marginBottom: 16, fontSize: 13 }}><Link href="/admin/review">← Admin review</Link></nav>
        <header style={card}>
          <p className="eyebrow">Business integrity queue</p>
          <h1 style={{ margin: 0 }}>비즈니스 요청 처리</h1>
          <p style={{ color: "#4b5563" }}>Business profiles, corrections, and business-submitted claims stay separate from citation-ready facts until independent human verification.</p>
          <AdminSecretField adminSecret={adminSecret} setAdminSecret={setAdminSecret} resetAdminSecret={resetAdminSecret} label="관리자 인증키" />
          <button onClick={load} disabled={loading || !adminSecret} style={{ marginTop: 12, ...button, background: "#111827" }}>{loading ? "로딩 중..." : "새로고침"}</button>
          {message && <p style={{ color: message.ok ? "#166534" : "#991b1b" }}>{message.text}</p>}
        </header>

        <section style={card} aria-labelledby="pending-profiles"><h2 id="pending-profiles">Pending business profiles ({profiles.length})</h2>{profiles.length === 0 ? <p>대기 중인 프로필 없음</p> : profiles.map((p) => <div key={p.id} style={card}><strong>{p.business_name}</strong> <span style={mono}>{p.entity_id}</span><p>{p.country} · {p.industry ?? "industry unknown"} · {p.verification_method}</p>{p.business_url && <p><a href={p.business_url}>{p.business_url}</a></p>}{p.verification_review_url && <p>review: <a href={p.verification_review_url}>{p.verification_review_url}</a></p>}<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button style={{ ...button, background: "#16a34a" }} onClick={() => patch("/api/business/profile", { profile_id: p.id, status: "verified" })}>approve</button><button style={{ ...button, background: "#dc2626" }} onClick={() => patch("/api/business/profile", { profile_id: p.id, status: "rejected" })}>reject</button><button style={{ ...button, background: "#f59e0b" }} onClick={() => patch("/api/business/profile", { profile_id: p.id, action: "request_source", reviewer_note: "Please provide additional ownership/source evidence." })}>request source</button></div></div>)}</section>

        <section style={card} aria-labelledby="business-corrections"><h2 id="business-corrections">Business corrections ({corrections.length})</h2>{corrections.length === 0 ? <p>대기 중인 correction 없음</p> : corrections.map((c) => <div key={c.id} style={card}><strong>{c.field_path}</strong> <span style={mono}>{c.entity_id}</span><p>{c.current_value ?? "unknown"} → <strong>{c.proposed_value}</strong></p><p>{c.reason}</p>{c.source_url && <p><a href={c.source_url}>{c.source_url}</a></p>}<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button style={{ ...button, background: "#16a34a" }} onClick={() => patch("/api/business/corrections", { correction_id: c.id, status: "accepted", reviewer_note: "Accepted for independent verification; not automatically citation-ready." })}>approve</button><button style={{ ...button, background: "#dc2626" }} onClick={() => patch("/api/business/corrections", { correction_id: c.id, status: "rejected" })}>reject</button><button style={{ ...button, background: "#f59e0b" }} onClick={() => patch("/api/business/corrections", { correction_id: c.id, action: "request_source", reviewer_note: "Please provide a traceable source." })}>request source</button></div></div>)}</section>

        <section style={card} aria-labelledby="business-claims"><h2 id="business-claims">Business-submitted claims ({claims.length})</h2><p style={{ color: "#991b1b", fontWeight: 700 }}>These rows are citation_ready=false and cannot become AI-citable before independent verification.</p>{claims.length === 0 ? <p>대기 중인 business claim 없음</p> : claims.map((c) => <div key={c.id} style={card}><strong>{c.claim_text}</strong> <span style={mono}>{c.field_path}</span><p>{c.claim_value}</p><p>citation_ready: <strong>{String(c.citation_ready)}</strong> · status: {c.status}</p>{c.source_url && <p><a href={c.source_url}>{c.source_url}</a></p>}<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button style={{ ...button, background: "#16a34a" }} onClick={() => patch("/api/business/submitted-claims", { claim_id: c.id, status: "accepted", reviewer_note: "Accepted only as intake; verify independently in canonical claims before citation." })}>approve</button><button style={{ ...button, background: "#dc2626" }} onClick={() => patch("/api/business/submitted-claims", { claim_id: c.id, status: "rejected" })}>reject</button><button style={{ ...button, background: "#f59e0b" }} onClick={() => patch("/api/business/submitted-claims", { claim_id: c.id, action: "request_source", reviewer_note: "Please provide independent source evidence." })}>request source</button></div></div>)}</section>
      </main>
    </div>
  );
}
