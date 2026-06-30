"use client";

import { useCallback, useState } from "react";
import Link from "next/link";

type ClaimSummary = {
  id?: string | null;
  field_path?: string | null;
  claim_text?: string | null;
  document_id?: string | null;
  entity_id?: string | null;
};

type SourceSuggestion = {
  id: string;
  claim_id?: string | null;
  source_type?: string | null;
  title?: string | null;
  url?: string | null;
  citation?: string | null;
  domain?: string | null;
  status?: string | null;
  contributor_hash?: string | null;
  created_at?: string | null;
  reviewed_at?: string | null;
  linked_claim_source_id?: string | null;
  claim_source_id?: string | null;
  claims?: ClaimSummary | null;
};

const STATUSES = ["pending", "accepted", "rejected", "duplicate", "spam"];
const ACTIONS = ["accept", "reject", "duplicate", "spam"] as const;
type ReviewAction = (typeof ACTIONS)[number];

export default function AdminSourceSuggestionsPage() {
  const [secret, setSecret] = useState("");
  const [adminActor, setAdminActor] = useState("");
  const [status, setStatus] = useState("pending");
  const [suggestions, setSuggestions] = useState<SourceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [promoteIds, setPromoteIds] = useState<Record<string, boolean>>({});

  const adminHeaders = useCallback(() => ({
    "x-admin-secret": secret,
    "x-admin-csrf": "1",
    ...(adminActor.trim() ? { "x-admin-actor": adminActor.trim() } : {}),
  }), [secret, adminActor]);

  const load = useCallback(async () => {
    if (!secret) return;
    setLoading(true);
    setMessage(null);
    try {
      const params = new URLSearchParams({ status, limit: "100" });
      const res = await fetch(`/api/admin/source-suggestions?${params.toString()}`, { headers: adminHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "source suggestion 목록 조회 실패");
      setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "source suggestion 목록 조회 실패" });
    } finally {
      setLoading(false);
    }
  }, [secret, status, adminHeaders]);

  async function reviewSuggestion(suggestion: SourceSuggestion, action: ReviewAction) {
    if (!secret) return;
    const promoteToClaimSource = action === "accept" && Boolean(promoteIds[suggestion.id]);
    const res = await fetch("/api/admin/source-suggestions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...adminHeaders() },
      body: JSON.stringify({ id: suggestion.id, action, promote_to_claim_source: promoteToClaimSource }),
    });
    const data = await res.json();
    if (res.ok) {
      setMessage({ ok: true, text: promoteToClaimSource && data.claim_source_id ? `✓ ${action} 처리 및 claim_sources 승격 완료: ${data.claim_source_id}` : `✓ ${action} 처리 완료` });
      await load();
    } else {
      setMessage({ ok: false, text: data.error ?? `${action} 처리 실패` });
    }
  }

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", padding: "40px 20px" }}>
      <nav style={{ marginBottom: 24, fontSize: 13, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Link href="/admin/review">← Admin 운영 콘솔</Link>
        <Link href="/admin/verify-claim">Claim verification wizard →</Link>
      </nav>
      <header className="registry-panel">
        <p className="eyebrow">Admin · Source suggestion inbox</p>
        <h1>Source suggestion 검토</h1>
        <p style={{ color: "#6b7280" }}>공개 제출 출처 후보를 pending 목록에서 검토하고 accept/reject/duplicate/spam으로 처리합니다. Accept 시 선택적으로 claim_sources에 승격할 수 있습니다.</p>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", marginTop: 16 }}>
          <input value={adminActor} onChange={(e) => setAdminActor(e.target.value)} placeholder="admin actor (email/name; hashed in audit log)" style={{ padding: 10 }} />
          <input aria-label="Admin secret" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="ADMIN_SECRET" style={{ padding: 10 }} onKeyDown={(e) => e.key === "Enter" && load()} />
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ padding: 10 }}>{STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          <button type="button" onClick={load} disabled={!secret || loading}>{loading ? "불러오는 중..." : "목록 불러오기"}</button>
        </div>
      </header>
      {message && <div style={{ padding: 12, marginBottom: 16, borderRadius: 8, background: message.ok ? "#f0fdf4" : "#fef2f2", color: message.ok ? "#166534" : "#991b1b" }}>{message.text}</div>}
      <section className="registry-panel">
        <h2>{status} suggestions · {suggestions.length}</h2>
        {suggestions.length === 0 && <p style={{ color: "#6b7280" }}>조건에 맞는 source suggestion이 없습니다.</p>}
        <div style={{ display: "grid", gap: 12 }}>
          {suggestions.map((suggestion) => (
            <article key={suggestion.id} className="claim-card" style={{ borderLeft: suggestion.status === "pending" ? "3px solid #f59e0b" : "3px solid #d1d5db" }}>
              <p className="eyebrow">{suggestion.status} · {suggestion.source_type ?? "unknown"} · {suggestion.domain ?? "no-domain"}</p>
              <h3 style={{ margin: "4px 0" }}>{suggestion.title ?? suggestion.url ?? suggestion.citation ?? "Untitled source"}</h3>
              {suggestion.url && <p><a href={suggestion.url} target="_blank" rel="noopener noreferrer">{suggestion.url}</a></p>}
              {suggestion.citation && <blockquote style={{ margin: "8px 0", paddingLeft: 12, borderLeft: "3px solid #e5e7eb", color: "#374151" }}>{suggestion.citation}</blockquote>}
              <p className="meta-label">claim_id: {suggestion.claim_id ?? "-"} · field_path: {suggestion.claims?.field_path ?? "-"}</p>
              <p style={{ color: "#4b5563", fontSize: 13 }}>{suggestion.claims?.claim_text ?? "연결된 claim 설명이 없습니다."}</p>
              <p className="meta-label">contributor_hash: {suggestion.contributor_hash ?? "-"} · submitted: {suggestion.created_at ? new Date(suggestion.created_at).toLocaleString("ko-KR") : "-"}</p>
              {suggestion.linked_claim_source_id && <p className="meta-label">linked_claim_source_id: {suggestion.linked_claim_source_id}</p>}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 12 }}>
                {suggestion.claim_id && <Link href={`/admin/verify-claim?claim_id=${encodeURIComponent(suggestion.claim_id)}`}>검증 wizard에서 열기</Link>}
                {suggestion.status === "pending" && <>
                  <label style={{ display: "inline-flex", gap: 4, alignItems: "center", fontSize: 13 }}><input type="checkbox" checked={Boolean(promoteIds[suggestion.id])} onChange={(e) => setPromoteIds((current) => ({ ...current, [suggestion.id]: e.target.checked }))} />accept 시 claim_sources에 추가</label>
                  {ACTIONS.map((action) => <button key={action} type="button" onClick={() => reviewSuggestion(suggestion, action)}>{action}</button>)}
                </>}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
