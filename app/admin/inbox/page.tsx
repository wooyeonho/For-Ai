"use client";
import { readAdminCsrfToken } from "@/lib/admin-client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { AdminSecretField, useAdminSecret } from "../AdminSecretProvider";

type InboxItem = { id: string; type: string; status: string; risk: string; created_at?: string | null; title: string; summary: string; linked_document?: { id: string; title?: string | null; slug?: string | null; lang?: string | null; url?: string | null } | null; linked_claim_id?: string | null };
type InboxPayload = { items: InboxItem[]; count: number; table_errors?: Record<string, string> };

const PANEL = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 20 };
const ACTIONS = [["approve", "approve"], ["reject", "reject"], ["spam", "spam"], ["duplicate", "duplicate"], ["link_to_claim", "link to claim"], ["promote_to_source", "promote to source"], ["create_document", "create document"]] as const;
const TYPE_LABELS: Record<string, string> = { community_post: "community_posts", source_suggestion: "source_suggestions", hallucination_report: "hallucination_reports", report: "reports", topic_suggestion: "topic_suggestions", topic_candidate: "topic_candidates", business_correction: "business_corrections" };
const RISK_COLOR: Record<string, string> = { low: "#166534", medium: "#92400e", high: "#991b1b", forbidden: "#7c3aed", business: "#047857", source: "#2563eb" };
function formatDate(value?: string | null) { return value ? new Date(value).toLocaleString("ko-KR") : "—"; }

export default function AdminInboxPage() {
  const { adminSecret, setAdminSecret, resetAdminSecret } = useAdminSecret();
  const [data, setData] = useState<InboxPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const filteredItems = useMemo(() => { const items = data?.items ?? []; return typeFilter === "all" ? items : items.filter((item) => item.type === typeFilter); }, [data?.items, typeFilter]);
  const countsByType = useMemo(() => (data?.items ?? []).reduce<Record<string, number>>((acc, item) => { acc[item.type] = (acc[item.type] ?? 0) + 1; return acc; }, {}), [data?.items]);

  const load = useCallback(async () => {
    setLoading(true); setMessage(null);
    try { const res = await fetch("/api/admin/inbox", { headers: { "x-admin-secret": adminSecret } }); const payload = await res.json(); setData(res.ok ? payload : null); setMessage({ ok: res.ok, text: res.ok ? "Inbox를 불러왔습니다." : payload.error ?? "Inbox 조회 실패" }); }
    catch { setMessage({ ok: false, text: "네트워크 오류" }); }
    finally { setLoading(false); }
  }, [adminSecret]);

  const act = useCallback(async (item: InboxItem, action: string) => {
    setMessage(null);
    const res = await fetch("/api/admin/inbox", { method: "PATCH", headers: { "Content-Type": "application/json", "x-admin-secret": adminSecret, "x-admin-csrf": readAdminCsrfToken() }, body: JSON.stringify({ id: item.id, type: item.type, action }) });
    const payload = await res.json(); setMessage({ ok: res.ok, text: res.ok ? `${TYPE_LABELS[item.type] ?? item.type} ${action} 처리 완료` : payload.error ?? "처리 실패" }); if (res.ok) await load();
  }, [adminSecret, load]);

  return <div style={{ minHeight: "100vh", background: "#f9fafb", padding: "32px 20px", fontFamily: "sans-serif" }}><main style={{ maxWidth: 1180, margin: "0 auto" }}>
    <header style={{ ...PANEL, marginBottom: 18 }}><p style={{ margin: "0 0 6px", color: "#6b7280", fontSize: 12, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" }}>Unified admin inbox</p><h1 style={{ margin: 0, fontSize: 30 }}>제보·신고·출처·커뮤니티 통합 Inbox</h1><p style={{ color: "#4b5563", lineHeight: 1.6, maxWidth: 820 }}>community_posts, source_suggestions, hallucination_reports, reports, topic_suggestions, topic_candidates, business_corrections를 한 화면에서 확인합니다. verified 승격은 별도 claim 검증 흐름에서 출처 기반으로 처리합니다.</p><AdminSecretField value={adminSecret} onChange={setAdminSecret} onReset={resetAdminSecret} onSubmit={load} loading={loading} buttonLabel="Inbox 불러오기" />{message && <p style={{ color: message.ok ? "#166534" : "#991b1b", marginBottom: 0 }}>{message.text}</p>}</header>
    <section style={{ ...PANEL, marginBottom: 18 }} aria-label="Inbox filters"><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button onClick={() => setTypeFilter("all")} style={{ padding: "8px 12px", borderRadius: 999, border: "1px solid #d1d5db", background: typeFilter === "all" ? "#111827" : "#fff", color: typeFilter === "all" ? "#fff" : "#111827" }}>전체 {data?.count ?? 0}</button>{Object.entries(TYPE_LABELS).map(([type, label]) => <button key={type} onClick={() => setTypeFilter(type)} style={{ padding: "8px 12px", borderRadius: 999, border: "1px solid #d1d5db", background: typeFilter === type ? "#111827" : "#fff", color: typeFilter === type ? "#fff" : "#111827" }}>{label} {countsByType[type] ?? 0}</button>)}</div>{data?.table_errors && Object.keys(data.table_errors).length > 0 && <p style={{ color: "#92400e", fontSize: 13 }}>일부 테이블은 아직 없거나 컬럼이 달라 건너뛰었습니다: {Object.keys(data.table_errors).join(", ")}</p>}</section>
    <section style={{ display: "grid", gap: 12 }} aria-label="Inbox items">{filteredItems.length === 0 ? <div style={PANEL}>Inbox 데이터를 불러오거나 필터를 변경하세요.</div> : filteredItems.map((item) => <article key={`${item.type}-${item.id}`} style={PANEL}><div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}><div><p style={{ margin: "0 0 8px", color: "#6b7280", fontSize: 12, fontWeight: 700 }}>{TYPE_LABELS[item.type] ?? item.type} · {formatDate(item.created_at)}</p><h2 style={{ margin: 0, fontSize: 19 }}>{item.title}</h2></div><div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}><span style={{ padding: "4px 8px", borderRadius: 999, background: "#f3f4f6", fontSize: 12, fontWeight: 700 }}>status: {item.status}</span><span style={{ padding: "4px 8px", borderRadius: 999, background: "#fff7ed", color: RISK_COLOR[item.risk] ?? "#92400e", fontSize: 12, fontWeight: 700 }}>risk: {item.risk}</span></div></div><p style={{ color: "#374151", lineHeight: 1.55 }}>{item.summary}</p><p style={{ color: "#6b7280", fontSize: 13 }}>linked document: {item.linked_document?.url ? <Link href={item.linked_document.url}>{item.linked_document.title ?? item.linked_document.slug ?? item.linked_document.id}</Link> : (item.linked_document?.id ?? "—")}{item.linked_claim_id ? <> · claim: <Link href={`/admin/verify-claim?claim_id=${encodeURIComponent(item.linked_claim_id)}`}>{item.linked_claim_id}</Link></> : null}</p><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{ACTIONS.map(([action, label]) => <button key={action} onClick={() => act(item, action)} disabled={action === "promote_to_source" && item.type !== "source_suggestion"} style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" }}>{label}</button>)}</div></article>)}</section>
  </main></div>;
}
