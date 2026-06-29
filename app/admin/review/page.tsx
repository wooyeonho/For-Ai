"use client";
import { ensureAdminSession } from "@/lib/admin-client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { ageInDays, isStale } from "../../../lib/citation-status";

type Counts = {
  candidates_new: number;
  candidates_approved: number;
  documents_published: number;
  claim_sources: number;
  claims_needs_review: number;
  claims_verified: number;
  documents_verified: number;
};

type PriorityClaim = {
  id: string;
  field_path: string;
  claim_text: string;
  claim_value: string;
  confidence: string;
  status: string;
  document_url?: string | null;
  documents?: { title?: string | null; slug?: string | null; lang?: string | null; status?: string | null } | null;
};

type ApprovedCandidate = {
  id: string;
  title: string;
  slug: string;
  lang: string;
  category: string;
  risk_tier: string;
  status: string;
};

type VerifiedDocument = {
  id: string;
  title: string;
  slug: string;
  lang: string;
  status: string;
  last_verified_at?: string | null;
  public_url?: string | null;
};

type TopCited = {
  document_id: string;
  title: string;
  view_count: number;
  ai_citation_count: number;
  public_url?: string | null;
};

type ReviewPayload = {
  counts: Counts;
  priorities: {
    needs_review_claims: PriorityClaim[];
    approved_candidates: ApprovedCandidate[];
  };
  verified_documents: VerifiedDocument[];
  engagement?: {
    total_views: number;
    total_citations: number;
    top_cited: TopCited[];
  };
};

const EMPTY_COUNTS: Counts = {
  candidates_new: 0,
  candidates_approved: 0,
  documents_published: 0,
  claim_sources: 0,
  claims_needs_review: 0,
  claims_verified: 0,
  documents_verified: 0,
};

export default function AdminReviewPage() {
  const [secret, setSecret] = useState("");
  const [data, setData] = useState<ReviewPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const counts = data?.counts ?? EMPTY_COUNTS;
  const checklist = useMemo(() => [
    { label: "후보 생성", count: counts.candidates_new, hint: "topic_candidates.status = new", href: "/admin/generate" },
    { label: "후보 검토", count: counts.candidates_new, hint: "새 후보를 검토 큐에서 확인", href: "/admin/candidates" },
    { label: "승인", count: counts.candidates_approved, hint: "topic_candidates.status = approved", href: "/admin/candidates" },
    { label: "공개 등록", count: counts.documents_published, hint: "documents.status = published", href: "/admin/candidates" },
    { label: "claim source 추가", count: counts.claim_sources, hint: "claim_sources rows", href: "/admin/verify-claim" },
    { label: "verified 승격", count: counts.claims_verified, hint: "claims.status = verified", href: "/admin/verify-claim" },
    { label: "verified 문서 공유", count: counts.documents_verified, hint: "documents.status = verified", href: "#verified-documents" },
  ], [counts]);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try { await ensureAdminSession(secret); } catch (e) { setLoading(false); setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) }); return; }
    const res = await fetch("/api/admin/review", { credentials: "same-origin" });
    const payload = await res.json();
    setLoading(false);
    if (res.ok) {
      setData(payload);
      setMessage({ ok: true, text: "Admin workflow count를 불러왔습니다." });
    } else {
      setMessage({ ok: false, text: payload.error ?? "Admin workflow 조회 실패" });
    }
  }, [secret]);

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "40px 20px" }}>
      <header className="registry-panel">
        <p className="eyebrow">Admin workflow</p>
        <h1>For-Ai admin review checklist</h1>
        <p>
          후보 생성부터 verified 문서 공유까지 claim-level 운영 상태를 admin API count로 확인합니다.
          오늘 해야 할 일은 needs_review claim과 approved candidate를 먼저 처리합니다.
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <input
            aria-label="Admin password"
            type="password"
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            placeholder="관리자 비밀번호"
            style={{ flex: 1, padding: 10 }}
          />
          <button onClick={load} disabled={loading}>{loading ? "불러오는 중..." : "count 불러오기"}</button>
        </div>
        {message && <p style={{ color: message.ok ? "#166534" : "#991b1b" }}>{message.text}</p>}
      </header>

      <section className="registry-panel" aria-labelledby="checklist-title">
        <h2 id="checklist-title">체크리스트</h2>
        <div className="meta-grid">
          {checklist.map((item) => (
            <Link key={item.label} href={item.href} style={{ textDecoration: "none", color: "inherit" }}>
              <div className="claim-card" style={{ height: "100%" }}>
                <p className="eyebrow">{item.hint}</p>
                <h3 style={{ margin: "4px 0" }}>{item.label}</h3>
                <p style={{ fontSize: 32, fontWeight: 800, margin: 0 }}>{item.count}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="registry-panel" aria-labelledby="today-title">
        <h2 id="today-title">오늘 해야 할 일</h2>
        <div className="stat-strip">
          <div className="stat"><span className="stat-num">{counts.claims_needs_review}</span><span className="stat-label">needs_review claim</span></div>
          <div className="stat"><span className="stat-num">{counts.candidates_approved}</span><span className="stat-label">approved candidate</span></div>
        </div>

        <h3>1순위 · needs_review claim</h3>
        {(data?.priorities.needs_review_claims.length ?? 0) === 0 && <p>대기 중인 needs_review claim이 없습니다.</p>}
        {data?.priorities.needs_review_claims.map((claim) => (
          <div className="claim-card" key={claim.id}>
            <p className="eyebrow">{claim.documents?.title ?? claim.documents?.slug ?? claim.id} · {claim.field_path}</p>
            <p><strong>{claim.claim_value}</strong></p>
            <p>{claim.claim_text}</p>
            <p><span className="badge badge-review">{claim.status}</span> <span className="badge badge-low">confidence: {claim.confidence}</span></p>
            <Link href="/admin/verify-claim">claim source 추가 + verified 승격</Link>
            {claim.document_url && <> · <a href={claim.document_url} target="_blank" rel="noopener noreferrer">문서 보기</a></>}
          </div>
        ))}

        <h3>2순위 · approved candidate 공개 등록</h3>
        {(data?.priorities.approved_candidates.length ?? 0) === 0 && <p>공개 등록 대기 중인 approved candidate가 없습니다.</p>}
        {data?.priorities.approved_candidates.map((candidate) => (
          <div className="claim-card" key={candidate.id}>
            <p className="eyebrow">{candidate.category} · risk: {candidate.risk_tier}</p>
            <p><strong>{candidate.title}</strong></p>
            <p>{candidate.lang}/wiki/{candidate.slug}</p>
            <p><span className="badge badge-review">{candidate.status}</span></p>
            <Link href="/admin/candidates">공개 등록하러 가기</Link>
          </div>
        ))}
      </section>

      <section className="registry-panel" aria-labelledby="engagement-title">
        <h2 id="engagement-title">인용 픽업 (실제 사용 계측)</h2>
        <div className="stat-strip">
          <div className="stat"><span className="stat-num">{data?.engagement?.total_views ?? 0}</span><span className="stat-label">누적 조회</span></div>
          <div className="stat"><span className="stat-num">{data?.engagement?.total_citations ?? 0}</span><span className="stat-label">누적 AI 인용</span></div>
        </div>
        <h3>인용 많은 문서 Top</h3>
        {(data?.engagement?.top_cited.length ?? 0) === 0 && <p>아직 집계된 AI 인용이 없습니다. 인용은 POST /api/documents/&lt;slug&gt;/cite로 증가합니다.</p>}
        {data?.engagement?.top_cited.map((doc) => (
          <div className="claim-card" key={doc.document_id}>
            <p><strong>{doc.title}</strong></p>
            <p>
              <span className="badge badge-verified">✦ AI 인용 {doc.ai_citation_count}</span>{" "}
              <span className="badge">👁 조회 {doc.view_count}</span>
            </p>
            {doc.public_url && <a href={doc.public_url} target="_blank" rel="noopener noreferrer">문서 보기</a>}
          </div>
        ))}
      </section>

      <section className="registry-panel" id="verified-documents" aria-labelledby="verified-title">
        <h2 id="verified-title">verified 완료 문서 공유</h2>
        {(() => {
          const staleCount = (data?.verified_documents ?? []).filter((doc) => isStale(doc.last_verified_at)).length;
          return staleCount > 0 ? (
            <p style={{ color: "#92400e" }}>⏳ 재검증 필요(180일 경과): <strong>{staleCount}</strong>건 — 신선도가 만료된 문서는 AI가 인용을 회피할 수 있습니다.</p>
          ) : null;
        })()}
        {(data?.verified_documents.length ?? 0) === 0 && <p>외부 공유 가능한 verified 문서가 없습니다.</p>}
        <ul className="link-list">
          {data?.verified_documents.map((doc) => {
            const stale = isStale(doc.last_verified_at);
            const age = ageInDays(doc.last_verified_at);
            return (
              <li key={doc.id}>
                <strong>{doc.title}</strong> · {doc.last_verified_at ?? "last_verified_at 없음"}
                {age !== null && (
                  <span className={stale ? "badge badge-review" : "badge badge-verified"} style={{ marginLeft: 8 }}>
                    {stale ? `⏳ ${age}일 경과 · 재검증` : `✓ ${age}일 전`}
                  </span>
                )}
                <br />
                {doc.public_url ? <a href={doc.public_url} target="_blank" rel="noopener noreferrer">{doc.public_url}</a> : <span>공유 링크 생성 불가</span>}
              </li>
            );
          })}
        </ul>
      </section>

      <nav className="registry-panel" aria-labelledby="admin-tools">
        <h2 id="admin-tools">Admin content tools</h2>
        <ul className="link-list">
          <li><Link href="/admin/verify-claim">Claim 검증 대시보드</Link></li>
          <li><Link href="/admin/candidates">후보 검토 큐</Link></li>
          <li><Link href="/admin/generate">후보 자동 생성</Link></li>
          <li><Link href="/admin/new-entity">Create new entity draft</Link></li>
          <li><Link href="/admin/new-document">Create new document draft</Link></li>
          <li><Link href="/admin/import">Bulk import stub</Link></li>
        </ul>
      </nav>
    </div>
  );
}
