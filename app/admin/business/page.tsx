"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { AdminSecretField, useAdminSecret } from "../AdminSecretProvider";

type BusinessProfile = { id: string; entity_id: string; business_name: string; business_url?: string | null; country: string; industry?: string | null; tier?: string | null; status: string; verification_method?: string | null; verification_review_url?: string | null; created_at?: string; };
type BusinessCorrection = { id: string; profile_id: string; entity_id: string; claim_id?: string | null; field_path: string; current_value?: string | null; proposed_value: string; reason: string; source_url?: string | null; priority: string; status: string; created_at?: string; verified_business_profiles?: { business_name?: string; tier?: string } | null; };
type BusinessSubmittedClaim = { id: string; profile_id: string; entity_id: string; document_id?: string | null; conflicts_with_claim_id?: string | null; field_path: string; claim_text: string; claim_value: string; source_url?: string | null; status: string; citation_ready: boolean; created_at?: string; verified_business_profiles?: { business_name?: string; tier?: string } | null; };
type BusinessAdminData = { profiles: BusinessProfile[]; corrections: BusinessCorrection[]; submitted_claims: BusinessSubmittedClaim[]; };

const PAGE = { minHeight: "100vh", background: "#f9fafb", padding: "32px 20px", fontFamily: "sans-serif" };
const WRAP = { maxWidth: 1180, margin: "0 auto" };
const PANEL = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 20 };
const GRID = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14 };
const MONO = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12, background: "#f3f4f6", borderRadius: 6, padding: "2px 6px" };

function ActionButtons({ onAction, disabled }: { onAction: (action: "approve" | "reject" | "request_source") => void; disabled: boolean }) {
  return <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}><button onClick={() => onAction("approve")} disabled={disabled} style={{ padding: "8px 10px", border: 0, borderRadius: 8, background: "#047857", color: "#fff", fontWeight: 700 }}>approve</button><button onClick={() => onAction("reject")} disabled={disabled} style={{ padding: "8px 10px", border: 0, borderRadius: 8, background: "#b91c1c", color: "#fff", fontWeight: 700 }}>reject</button><button onClick={() => onAction("request_source")} disabled={disabled} style={{ padding: "8px 10px", border: "1px solid #d97706", borderRadius: 8, background: "#fffbeb", color: "#92400e", fontWeight: 700 }}>request source</button></div>;
}
function fmtDate(value?: string) { return value ? new Date(value).toLocaleString("ko-KR") : "—"; }

export default function AdminBusinessPage() {
  const { adminSecret, setAdminSecret, resetAdminSecret } = useAdminSecret();
  const [data, setData] = useState<BusinessAdminData>({ profiles: [], corrections: [], submitted_claims: [] });
  const [loading, setLoading] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setMessage(null);
    try {
      const headers = { "x-admin-secret": adminSecret };
      const [profileRes, correctionRes] = await Promise.all([fetch("/api/business/profile?status=pending", { headers }), fetch("/api/business/corrections?status=new&include_submitted_claims=1", { headers })]);
      const [profilePayload, correctionPayload] = await Promise.all([profileRes.json(), correctionRes.json()]);
      if (!profileRes.ok) throw new Error(profilePayload.error ?? "pending profiles 조회 실패");
      if (!correctionRes.ok) throw new Error(correctionPayload.error ?? "business corrections 조회 실패");
      setData({ profiles: profilePayload.profiles ?? [], corrections: correctionPayload.corrections ?? [], submitted_claims: correctionPayload.submitted_claims ?? [] });
      setMessage({ ok: true, text: "Business 운영 큐를 불러왔습니다." });
    } catch (error) { setMessage({ ok: false, text: error instanceof Error ? error.message : "조회 실패" }); } finally { setLoading(false); }
  }, [adminSecret]);
  const act = useCallback(async (kind: "profile" | "correction" | "submitted_claim", id: string, action: "approve" | "reject" | "request_source") => {
    setActingId(id); setMessage(null);
    try {
      const endpoint = kind === "profile" ? "/api/business/profile" : "/api/business/corrections";
      const idKey = kind === "profile" ? "profile_id" : kind === "correction" ? "correction_id" : "submitted_claim_id";
      const res = await fetch(endpoint, { method: "PATCH", headers: { "content-type": "application/json", "x-admin-secret": adminSecret }, body: JSON.stringify({ [idKey]: id, action, reviewer_note: action === "request_source" ? "Admin requested traceable source before approval." : undefined }) });
      const payload = await res.json(); if (!res.ok) throw new Error(payload.error ?? "처리 실패");
      setMessage({ ok: true, text: `${kind} ${action} 처리 완료` }); await load();
    } catch (error) { setMessage({ ok: false, text: error instanceof Error ? error.message : "처리 실패" }); } finally { setActingId(null); }
  }, [adminSecret, load]);
  return <div style={PAGE}><main style={WRAP}><header style={{ ...PANEL, marginBottom: 18 }}><Link href="/admin" style={{ color: "#2563eb", fontSize: 13, fontWeight: 700 }}>← Admin dashboard</Link><h1 style={{ margin: "10px 0 6px", fontSize: 30 }}>Business operations</h1><p style={{ color: "#4b5563", lineHeight: 1.6, maxWidth: 850 }}>pending business profiles, business corrections, business-submitted claims를 한 곳에서 검토합니다. business-submitted claim은 independent verification 전까지 citation-ready가 아니며, 승인은 검증 큐로 보내는 운영 판단일 뿐 canonical verified claim 승격이 아닙니다.</p><AdminSecretField adminSecret={adminSecret} setAdminSecret={setAdminSecret} resetAdminSecret={resetAdminSecret} /><button onClick={load} disabled={loading} style={{ marginTop: 12, padding: "10px 16px", border: 0, borderRadius: 10, background: "#111827", color: "#fff", fontWeight: 700 }}>{loading ? "불러오는 중..." : "Business queues 불러오기"}</button>{message && <p style={{ color: message.ok ? "#166534" : "#991b1b" }}>{message.text}</p>}</header><section style={GRID} aria-label="Business queue summary"><div style={PANEL}><strong>Pending business profiles</strong><div style={{ fontSize: 34, fontWeight: 800, color: "#047857" }}>{data.profiles.length}</div></div><div style={PANEL}><strong>Business corrections</strong><div style={{ fontSize: 34, fontWeight: 800, color: "#d97706" }}>{data.corrections.length}</div></div><div style={PANEL}><strong>Business-submitted claims</strong><div style={{ fontSize: 34, fontWeight: 800, color: "#7c3aed" }}>{data.submitted_claims.length}</div></div></section><section style={{ ...PANEL, marginTop: 18 }}><h2>Pending business profiles</h2>{data.profiles.length === 0 ? <p style={{ color: "#6b7280" }}>대기 중인 profile이 없습니다.</p> : data.profiles.map((profile) => <article key={profile.id} style={{ borderTop: "1px solid #e5e7eb", paddingTop: 14, marginTop: 14 }}><strong>{profile.business_name}</strong> <span style={MONO}>{profile.entity_id}</span><p style={{ color: "#4b5563" }}>{profile.country} · {profile.industry ?? "industry unknown"} · {profile.verification_method} · submitted {fmtDate(profile.created_at)}</p>{profile.business_url && <p><a href={profile.business_url}>{profile.business_url}</a></p>}{profile.verification_review_url && <p><a href={profile.verification_review_url}>verification evidence review link</a></p>}<ActionButtons disabled={actingId === profile.id} onAction={(action) => act("profile", profile.id, action)} /></article>)}</section><section style={{ ...PANEL, marginTop: 18 }}><h2>Business corrections</h2>{data.corrections.length === 0 ? <p style={{ color: "#6b7280" }}>새 correction이 없습니다.</p> : data.corrections.map((correction) => <article key={correction.id} style={{ borderTop: "1px solid #e5e7eb", paddingTop: 14, marginTop: 14 }}><strong>{correction.verified_business_profiles?.business_name ?? correction.profile_id}</strong> <span style={MONO}>{correction.field_path}</span><p style={{ color: "#4b5563" }}>{correction.entity_id} · priority {correction.priority} · status {correction.status} · {fmtDate(correction.created_at)}</p><p>Current: <span style={MONO}>{correction.current_value ?? "unknown"}</span></p><p>Proposed: <span style={MONO}>{correction.proposed_value}</span></p><p>{correction.reason}</p>{correction.source_url && <p><a href={correction.source_url}>submitted source</a></p>}<ActionButtons disabled={actingId === correction.id} onAction={(action) => act("correction", correction.id, action)} /></article>)}</section><section style={{ ...PANEL, marginTop: 18 }}><h2>Business-submitted claims</h2><p style={{ color: "#6b7280" }}>항목은 business-claimed intake이며 <strong>citation_ready=false</strong>로 유지됩니다. approve는 independent verification 대상 수락이며 citation-ready 전환이 아닙니다.</p>{data.submitted_claims.length === 0 ? <p style={{ color: "#6b7280" }}>대기 중인 business-submitted claim이 없습니다.</p> : data.submitted_claims.map((claim) => <article key={claim.id} style={{ borderTop: "1px solid #e5e7eb", paddingTop: 14, marginTop: 14 }}><strong>{claim.verified_business_profiles?.business_name ?? claim.profile_id}</strong> <span style={MONO}>{claim.field_path}</span><p style={{ color: "#4b5563" }}>{claim.entity_id} · status {claim.status} · citation_ready {String(claim.citation_ready)} · {fmtDate(claim.created_at)}</p><p>{claim.claim_text}</p><p>Value: <span style={MONO}>{claim.claim_value}</span></p>{claim.source_url && <p><a href={claim.source_url}>submitted source</a></p>}<ActionButtons disabled={actingId === claim.id} onAction={(action) => act("submitted_claim", claim.id, action)} /></article>)}</section></main></div>;
}
