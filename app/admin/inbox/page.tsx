"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useAdminSecret } from "../AdminSecretProvider";

type InboxItem = {
  id: string;
  type: string;
  risk: string;
  status?: string | null;
  created_at?: string | null;
  contributor_hash?: string | null;
  document_id?: string | null;
  document_title?: string | null;
  document_slug?: string | null;
  document_lang?: string | null;
  claim_id?: string | null;
  title: string;
  summary?: string | null;
  url?: string | null;
  actions: string[];
};

type InboxPayload = { items: InboxItem[]; errors?: string[] };

const ACTION_LABEL: Record<string, string> = {
  approve: "approve",
  reject: "reject",
  spam: "spam",
  promote_to_source: "promote to source",
  create_topic_candidate: "create topic candidate",
  link_to_claim: "link to claim",
};
const RISK_COLOR: Record<string, string> = { low: "#166534", medium: "#92400e", high: "#991b1b", forbidden: "#7c3aed" };

export default function AdminInboxPage() {
  const { adminSecret, setAdminSecret } = useAdminSecret();
  const [data, setData] = useState<InboxPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [typeFilter, setTypeFilter] = useState("all");

  const items = useMemo(() => {
    const rows = data?.items ?? [];
    return typeFilter === "all" ? rows : rows.filter((item) => item.type === typeFilter);
  }, [data, typeFilter]);
  const counts = useMemo(() => (data?.items ?? []).reduce<Record<string, number>>((acc, item) => {
    acc[item.type] = (acc[item.type] ?? 0) + 1;
    return acc;
  }, {}), [data]);

  async function load() {
    setLoading(true);
    setMessage(null);
    const res = await fetch("/api/admin/inbox", { headers: { "x-admin-secret": adminSecret } });
    const payload = await res.json();
    setLoading(false);
    if (res.ok) {
      setData(payload);
      setMessage({ ok: true, text: `inbox ${payload.items?.length ?? 0}건을 불러왔습니다.` });
    } else {
      setMessage({ ok: false, text: payload.error ?? "inbox 조회 실패" });
    }
  }

  async function act(item: InboxItem, action: string) {
    if (action === "link_to_claim") {
      window.location.href = `/admin/verify-claim${item.claim_id ? `?claim_id=${encodeURIComponent(item.claim_id)}` : ""}`;
      return;
    }
    const res = await fetch("/api/admin/inbox", {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-admin-secret": adminSecret, "x-admin-csrf": "admin-inbox" },
      body: JSON.stringify({ id: item.id, type: item.type, action, title: item.title, contributor_hash: item.contributor_hash }),
    });
    const payload = await res.json();
    if (res.ok) {
      setMessage({ ok: true, text: `${item.type} ${action} 처리 완료` });
      await load();
    } else {
      setMessage({ ok: false, text: payload.error ?? `${action} 실패` });
    }
  }

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "40px 20px" }}>
      <header className="registry-panel">
        <p className="eyebrow">Admin moderation inbox</p>
        <h1>통합 제보/신고/글/출처 Inbox</h1>
        <p>
          community_posts, source_suggestions, hallucination_reports, reports, topic_suggestions,
          topic_candidates를 한 화면에 모아 claim-level 검토 흐름으로 처리합니다.
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <input aria-label="Admin secret" type="password" value={adminSecret} onChange={(event) => setAdminSecret(event.target.value)} placeholder="ADMIN_SECRET" style={{ flex: 1, padding: 10 }} onKeyDown={(event) => event.key === "Enter" && load()} />
          <button onClick={load} disabled={loading}>{loading ? "불러오는 중..." : "Inbox 불러오기"}</button>
          <Link href="/admin/review" style={{ padding: "9px 12px", borderRadius: 8, background: "#f3f4f6", color: "#111827", textDecoration: "none", fontWeight: 700 }}>review로 돌아가기</Link>
        </div>
        {message && <p style={{ color: message.ok ? "#166534" : "#991b1b" }}>{message.text}</p>}
        {(data?.errors?.length ?? 0) > 0 && <p style={{ color: "#92400e" }}>일부 테이블 조회 실패: {data?.errors?.join(" / ")}</p>}
      </header>

      <section className="registry-panel">
        <h2>Queue summary</h2>
        <div className="stat-strip">
          {["all", "community_post", "source_suggestion", "hallucination_report", "report", "topic_suggestion", "topic_candidate"].map((type) => (
            <button key={type} onClick={() => setTypeFilter(type)} style={{ textAlign: "left", border: typeFilter === type ? "2px solid #111827" : "1px solid #e5e7eb", borderRadius: 10, padding: 12, background: "#fff" }}>
              <span className="stat-num">{type === "all" ? data?.items.length ?? 0 : counts[type] ?? 0}</span><br />
              <span className="stat-label">{type}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="registry-panel">
        <h2>처리 대상</h2>
        {items.length === 0 && <p>운영 데이터를 불러오거나 필터를 변경하세요.</p>}
        {items.map((item) => (
          <article key={`${item.type}-${item.id}`} className="claim-card" style={{ borderLeft: `4px solid ${RISK_COLOR[item.risk] ?? "#e5e7eb"}` }}>
            <p className="eyebrow">{item.type} · risk <span style={{ color: RISK_COLOR[item.risk] ?? "#374151" }}>{item.risk}</span> · status {item.status ?? "-"}</p>
            <h3 style={{ margin: "4px 0" }}>{item.title}</h3>
            <p style={{ color: "#374151" }}>{item.summary ?? "요약 없음"}</p>
            <p className="meta-label">created_at: {item.created_at ?? "-"} · contributor_hash: {item.contributor_hash ?? "-"}</p>
            <p className="meta-label">
              linked document: {item.document_title ?? item.document_id ?? "-"}
              {item.document_slug && <> · <Link href={`/${item.document_lang ?? "ko"}/wiki/${item.document_slug}`}>/{item.document_lang ?? "ko"}/wiki/{item.document_slug}</Link></>}
              {item.claim_id && <> · claim_id: <code>{item.claim_id}</code></>}
            </p>
            {item.url && <p><a href={item.url} target="_blank" rel="noopener noreferrer">source/source hint 열기 ↗</a></p>}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {item.actions.map((action) => (
                <button key={action} onClick={() => act(item, action)} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db", background: action === "spam" ? "#fee2e2" : action === "approve" ? "#dcfce7" : "#fff" }}>
                  {ACTION_LABEL[action] ?? action}
                </button>
              ))}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
