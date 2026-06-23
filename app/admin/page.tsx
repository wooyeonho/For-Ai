"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Counts = {
  new_candidates: number;
  reviewing_candidates: number;
  approved_candidates: number;
  promoted_candidates: number;
  published_documents: number;
  verified_documents: number;
  needs_review_claims: number;
  verified_claims: number;
  claim_sources: number;
};

type Candidate = { id: string; title: string; slug: string; category: string; created_at?: string };
type ClaimDocument = { id: string; slug: string; lang: string; title: string } | null;
type ReviewClaim = {
  id: string;
  field_path: string;
  claim_text: string;
  claim_value: string;
  status: string;
  documents?: ClaimDocument | ClaimDocument[];
};
type VerifiedDocument = { id: string; slug: string; lang: string; title: string; last_verified_at?: string | null };
type Dashboard = {
  counts: Counts;
  today: { needs_review_claims: ReviewClaim[]; approved_candidates: Candidate[] };
  verified_documents: VerifiedDocument[];
};

const emptyCounts: Counts = {
  new_candidates: 0,
  reviewing_candidates: 0,
  approved_candidates: 0,
  promoted_candidates: 0,
  published_documents: 0,
  verified_documents: 0,
  needs_review_claims: 0,
  verified_claims: 0,
  claim_sources: 0,
};

function publicPath(doc: { lang?: string; slug: string }) {
  return `/${doc.lang ?? "ko"}/wiki/${doc.slug}`;
}

function claimDocument(claim: ReviewClaim): ClaimDocument {
  if (Array.isArray(claim.documents)) return claim.documents[0] ?? null;
  return claim.documents ?? null;
}

export default function AdminLandingPage() {
  const [secret, setSecret] = useState("");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/dashboard", { headers: { "x-admin-secret": secret } });
    const data = await res.json();
    setLoading(false);
    if (res.ok) {
      setDashboard(data);
      setMessage(null);
    } else {
      setMessage({ ok: false, text: data.error ?? "admin dashboard 조회 실패" });
    }
  }, [secret]);

  useEffect(() => { load(); }, [load]);

  const counts = dashboard?.counts ?? emptyCounts;
  const checklist = useMemo(() => [
    { label: "후보 생성", count: counts.new_candidates, hint: "topic_candidates.status = new", href: "/admin/generate" },
    { label: "후보 검토", count: counts.reviewing_candidates, hint: "topic_candidates.status = reviewing", href: "/admin/candidates" },
    { label: "승인", count: counts.approved_candidates, hint: "topic_candidates.status = approved", href: "/admin/candidates" },
    { label: "공개 등록", count: counts.published_documents, hint: "documents.status = published", href: "/admin/candidates" },
    { label: "claim source 추가", count: counts.claim_sources, hint: "claim_sources rows", href: "/admin/verify-claim" },
    { label: "verified 승격", count: counts.verified_claims, hint: "claims.status = verified", href: "/admin/verify-claim" },
    { label: "verified 문서 공유", count: counts.verified_documents, hint: "documents.status = verified", href: "#verified-documents" },
  ], [counts]);

  return (
    <main style={{ maxWidth: 1040, margin: "0 auto", padding: "40px 20px" }}>
      <header className="registry-panel">
        <p className="eyebrow">Admin · Mission control</p>
        <h1>GYEOL admin checklist</h1>
        <p>후보 생성부터 verified 문서 공유까지 claim-level 운영 흐름을 한 화면에서 확인합니다.</p>
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="ADMIN_SECRET" style={{ flex: 1, padding: 10 }} />
          <button onClick={load} disabled={loading}>{loading ? "불러오는 중..." : "새로고침"}</button>
        </div>
      </header>

      {message && <div style={{ padding: 12, marginBottom: 16, borderRadius: 8, background: message.ok ? "#f0fdf4" : "#fef2f2", color: message.ok ? "#166534" : "#991b1b" }}>{message.text}</div>}

      <section className="registry-panel" aria-labelledby="today-work">
        <h2 id="today-work">오늘 해야 할 일</h2>
        <p className="meta-label">우선순위: needs_review claim → approved candidate</p>
        <div className="meta-grid">
          <div><span className="meta-label">needs_review claims</span><br /><strong>{counts.needs_review_claims}</strong></div>
          <div><span className="meta-label">approved candidates</span><br /><strong>{counts.approved_candidates}</strong></div>
        </div>
        <h3>1. needs_review claim</h3>
        {(dashboard?.today.needs_review_claims.length ?? 0) === 0 ? <p>검토할 claim이 없습니다.</p> : dashboard?.today.needs_review_claims.map((claim) => {
          const doc = claimDocument(claim);
          return <div className="claim-card" key={claim.id}>
            <p className="eyebrow">{doc?.title ?? "문서 확인 필요"} · {claim.field_path}</p>
            <p><strong>{claim.claim_value}</strong></p>
            <p>{claim.claim_text}</p>
            <p><Link href="/admin/verify-claim">출처 추가 + verified 승격</Link>{doc && <> · <Link href={publicPath(doc)}>문서 보기</Link></>}</p>
          </div>;
        })}
        <h3>2. approved candidate</h3>
        {(dashboard?.today.approved_candidates.length ?? 0) === 0 ? <p>공개 등록할 승인 후보가 없습니다.</p> : dashboard?.today.approved_candidates.map((candidate) => (
          <div className="claim-card" key={candidate.id}>
            <p className="eyebrow">{candidate.category} · approved</p>
            <p><strong>{candidate.title}</strong></p>
            <p className="meta-label">{candidate.slug}</p>
            <p><Link href="/admin/candidates">공개 등록하러 가기</Link></p>
          </div>
        ))}
      </section>

      <section className="registry-panel" aria-labelledby="pipeline-checklist">
        <h2 id="pipeline-checklist">운영 체크리스트</h2>
        <div className="meta-grid">
          {checklist.map((item) => <Link key={item.label} href={item.href} style={{ textDecoration: "none", color: "inherit" }}>
            <span className="meta-label">{item.hint}</span><br />
            <strong style={{ fontSize: 24 }}>{item.count}</strong><br />
            {item.label}
          </Link>)}
        </div>
      </section>

      <section className="registry-panel" id="verified-documents" aria-labelledby="verified-documents-heading">
        <h2 id="verified-documents-heading">verified 완료 문서 공유 링크</h2>
        {(dashboard?.verified_documents.length ?? 0) === 0 ? <p>공유 가능한 verified 문서가 없습니다.</p> : <ul className="link-list">
          {dashboard?.verified_documents.map((doc) => <li key={doc.id}>
            <Link href={publicPath(doc)}>{doc.title}</Link> <code>{publicPath(doc)}</code>
          </li>)}
        </ul>}
      </section>

      <nav className="registry-panel" aria-labelledby="admin-tools">
        <h2 id="admin-tools">Admin content tools</h2>
        <ul className="link-list">
          <li><Link href="/admin/review">기존 review queue</Link></li>
          <li><Link href="/admin/verify-claim">Claim 검증 대시보드</Link></li>
          <li><Link href="/admin/candidates">후보 검토 큐</Link></li>
          <li><Link href="/admin/generate">후보 자동 생성</Link></li>
        </ul>
      </nav>
    </main>
  );
}
