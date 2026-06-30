"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { ageInDays, isStale } from "../../../lib/citation-status";
import { useAdminSecret } from "../AdminSecretProvider";

type Counts = {
  pending_community_posts: number;
  candidates_new: number;
  candidates_generated: number;
  candidates_approved?: number;
  documents_published: number;
  claim_sources: number;
  claims_needs_review: number;
  claims_verified: number;
  documents_verified: number;
};

type PriorityOrdering = { rank: number; key: string; label: string; count: number; href: string; reason: string };

type PendingCommunityPost = {
  id: string;
  author_type: string;
  author_name?: string | null;
  content: string;
  status: string;
  created_at?: string | null;
};

type PriorityClaim = {
  id: string;
  entity_id?: string | null;
  document_id?: string | null;
  field_path: string;
  claim_text: string;
  claim_value: string;
  confidence: string;
  status: string;
  last_verified_at?: string | null;
  contributor_hash?: string | null;
  ai_provider?: string | null;
  ai_model?: string | null;
  source_candidates?: { title?: string; url?: string; source_type?: string }[];
  source_trust_scores?: { id: string; score: number }[];
  document_url?: string | null;
  verify_url?: string | null;
  documents?: { title?: string | null; slug?: string | null; lang?: string | null; status?: string | null; category?: string | null } | null;
};

type Candidate = {
  id: string;
  title: string;
  slug: string;
  lang: string;
  category: string;
  risk_tier: string;
  status: string;
  created_at?: string | null;
  reviewed_at?: string | null;
  promoted_at?: string | null;
  public_url?: string | null;
  verify_url?: string | null;
};

type VerifiedDocument = {
  id: string;
  title: string;
  slug: string;
  lang: string;
  category?: string | null;
  status: string;
  last_verified_at?: string | null;
  public_url?: string | null;
  verify_url?: string | null;
};

type TopCited = {
  document_id: string;
  title: string;
  view_count: number;
  ai_citation_count: number;
  human_view_count: number;
  bot_view_count: number;
  ai_crawler_view_count: number;
  api_cite_count: number;
  citation_copy_count: number;
  report_submission_count: number;
  public_url?: string | null;
};

type ReviewPayload = {
  counts: Counts;
  priority_ordering: PriorityOrdering[];
  community_posts: { pending: PendingCommunityPost[] };
  priorities: {
    needs_review_claims: PriorityClaim[];
    new_candidates: Candidate[];
    approved_candidates: Candidate[];
    generated_candidates: Candidate[];
  };
  promoted_documents: Candidate[];
  verified_documents: VerifiedDocument[];
  high_risk: { categories: string[]; candidates: Candidate[]; documents: Array<{ title?: string | null; slug?: string | null; category?: string | null; claim_id?: string; field_path?: string }> };
  engagement?: {
    total_views: number;
    total_citations: number;
    total_human_views: number;
    total_bot_views: number;
    total_ai_crawler_views: number;
    total_api_cite_calls: number;
    total_citation_copy_clicks: number;
    total_report_submissions: number;
    monetization_boundary: string;
    top_cited: TopCited[];
  };
};

const EMPTY_COUNTS: Counts = {
  pending_community_posts: 0,
  candidates_new: 0,
  candidates_generated: 0,
  documents_published: 0,
  claim_sources: 0,
  claims_needs_review: 0,
  claims_verified: 0,
  documents_verified: 0,
};

const primaryButtonStyle = { padding: "8px 12px", borderRadius: 8, background: "#111827", color: "#fff", textDecoration: "none", display: "inline-block", fontWeight: 700 };
const secondaryButtonStyle = { padding: "8px 12px", borderRadius: 8, background: "#f3f4f6", color: "#111827", textDecoration: "none", display: "inline-block", fontWeight: 700 };

const RISK_COLOR: Record<string, string> = {
  low: "#166534",
  medium: "#92400e",
  high: "#991b1b",
  forbidden: "#7c3aed",
};

function urgencyBand(claims_needs_review: number, candidates_approved: number) {
  const total = claims_needs_review + candidates_approved;
  if (total === 0) return { label: "✓ 오늘 할 일 없음", color: "#166534" };
  if (total <= 3) return { label: `⚡ 경미 · ${total}건`, color: "#92400e" };
  return { label: `🔴 주의 필요 · ${total}건`, color: "#991b1b" };
}

export default function AdminReviewPage() {
  const { adminSecret, setAdminSecret } = useAdminSecret();
  const [data, setData] = useState<ReviewPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const counts = data?.counts ?? EMPTY_COUNTS;

  const checklist = useMemo(() => [
    { label: "글 관리", count: counts.pending_community_posts, hint: "community_posts.status = pending", href: "/admin/posts?status=pending", urgent: counts.pending_community_posts > 0 },
    { label: "신규 후보", count: counts.candidates_new, hint: "topic_candidates.status = new", href: "/admin/candidates?status=new", urgent: counts.candidates_new === 0 },
    { label: "AI claim 생성", count: counts.candidates_generated, hint: "topic_candidates.status = generated", href: "/admin/candidates", urgent: false },
    { label: "needs_review claim", count: counts.claims_needs_review, hint: "claims.status = needs_review", href: "/admin/verify-claim", urgent: counts.claims_needs_review > 0 },
    { label: "공개 등록", count: counts.documents_published, hint: "documents.status = published", href: "/admin/candidates", urgent: false },
    { label: "claim source", count: counts.claim_sources, hint: "claim_sources rows", href: "/admin/verify-claim", urgent: false },
    { label: "verified 문서", count: counts.documents_verified, hint: "documents.status = verified", href: "#verified-documents", urgent: false },
  ], [counts]);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    const res = await fetch("/api/admin/review", { headers: { "x-admin-secret": adminSecret } });
    const payload = await res.json();
    setLoading(false);
    if (res.ok) {
      setData(payload);
      setMessage({ ok: true, text: "통합 운영 콘솔 데이터를 불러왔습니다." });
    } else {
      setMessage({ ok: false, text: payload.error ?? "Admin workflow 조회 실패" });
    }
  }, [adminSecret]);

  const urgency = urgencyBand(counts.claims_needs_review, counts.candidates_approved ?? 0);
  const staleDocCount = (data?.verified_documents ?? []).filter((doc) => isStale(doc.last_verified_at)).length;

  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", padding: "40px 20px" }}>
      <header className="registry-panel">
        <p className="eyebrow">Unified admin operations</p>
        <h1>For-Ai 통합 운영 콘솔</h1>
        <p>
          pending community posts, topic candidates, needs_review claims, promoted/verified documents,
          high-risk categories를 한 화면에서 확인하고 오늘 처리 순서대로 이동합니다.
          후보 생성부터 verified 문서 공유까지 claim-level 운영 상태를 admin API count로 확인합니다.
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <input
            aria-label="Admin secret"
            type="password"
            value={adminSecret}
            onChange={(event) => setAdminSecret(event.target.value)}
            placeholder="ADMIN_SECRET"
            style={{ flex: 1, padding: 10 }}
            onKeyDown={(e) => e.key === "Enter" && load()}
          />
          <button onClick={load} disabled={loading}>{loading ? "불러오는 중..." : "운영 현황 불러오기"}</button>
        </div>
        {message && <p style={{ marginTop: 8, color: message.ok ? "#166534" : "#991b1b" }}>{message.text}</p>}
      </header>

      {/* Urgency banner */}
      {data && (
        <div style={{ padding: "12px 20px", borderRadius: 8, marginBottom: 24, background: "#fafafa", border: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <span style={{ fontWeight: 700, fontSize: 18, color: urgency.color }}>{urgency.label}</span>
          <span style={{ fontSize: 13, color: "#6b7280" }}>
            {staleDocCount > 0 && <span style={{ color: "#92400e", marginRight: 12 }}>⏳ 재검증 필요 {staleDocCount}건</span>}
            마지막 갱신: {new Date().toLocaleTimeString("ko-KR")}
          </span>
        </div>
      )}

      <section className="registry-panel" aria-labelledby="priority-title">
        <h2 id="priority-title">오늘 무엇부터 처리할까요?</h2>
        {(data?.priority_ordering.length ?? 0) === 0 && <p>운영 데이터를 불러오면 priority ordering이 표시됩니다.</p>}
        {data?.priority_ordering.map((item) => (
          <div className="claim-card" key={item.key} style={{ display: "grid", gridTemplateColumns: "72px 1fr auto", gap: 16, alignItems: "center" }}>
            <strong style={{ fontSize: 24 }}>#{item.rank}</strong>
            <div>
              <p className="eyebrow">{item.label}</p>
              <p style={{ margin: 0 }}>{item.reason}</p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ fontSize: 28, fontWeight: 800, margin: "0 0 8px" }}>{item.count}</p>
              <Link href={item.href} style={primaryButtonStyle}>바로 처리</Link>
            </div>
          </div>
        ))}
      </section>

      {/* Workflow checklist */}
      <section className="registry-panel" aria-labelledby="checklist-title">
        <h2 id="checklist-title">운영 체크리스트</h2>
        <div className="meta-grid">
          {checklist.map((item) => (
            <Link key={item.label} href={item.href} style={{ textDecoration: "none", color: "inherit" }}>
              <div className="claim-card" style={{ height: "100%", borderLeft: item.urgent ? "3px solid #ef4444" : "3px solid #e5e7eb" }}>
                <p className="eyebrow">{item.hint}</p>
                <h3 style={{ margin: "4px 0" }}>{item.label}</h3>
                <p style={{ fontSize: 32, fontWeight: 800, margin: 0, color: item.urgent ? "#991b1b" : undefined }}>{item.count}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Today's priority queue */}
      <section className="registry-panel" aria-labelledby="today-title">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 id="today-title" style={{ margin: 0 }}>오늘 해야 할 일</h2>
          <Link href="/admin/verify-claim?claim_status=needs_review" style={{ fontSize: 13 }}>검증 큐 전체 보기 →</Link>
        </div>
        <div className="stat-strip" style={{ marginBottom: 24 }}>
          <div className="stat">
            <span className="stat-num" style={{ color: counts.claims_needs_review > 0 ? "#991b1b" : "#166534" }}>
              {counts.claims_needs_review}
            </span>
            <span className="stat-label">needs_review claim</span>
          </div>
          <div className="stat"><span className="stat-num">{counts.candidates_generated}</span><span className="stat-label">generated candidate</span></div>
          <div className="stat">
            <span className="stat-num" style={{ color: (counts.candidates_approved ?? 0) > 0 ? "#92400e" : "#166534" }}>
              {counts.candidates_approved ?? 0}
            </span>
            <span className="stat-label">approved candidate</span>
          </div>
        </div>

        {/* Priority 1: needs_review claims */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: "0 0 12px" }}>1순위 · needs_review claim 검증</h3>
        </div>
        {(data?.priorities.needs_review_claims.length ?? 0) === 0 && (
          <p style={{ color: "#6b7280" }}>✓ 대기 중인 needs_review claim이 없습니다.</p>
        )}
        {data?.priorities.needs_review_claims.map((claim) => {
          const doc = Array.isArray(claim.documents) ? claim.documents[0] : claim.documents;
          const slug = doc?.slug;
          return (
            <div className="claim-card" key={claim.id} style={{ borderLeft: "3px solid #fca5a5" }}>
              <p className="eyebrow">
                {doc?.title ?? slug ?? claim.id} · <code style={{ fontSize: 11 }}>{claim.field_path}</code>
              </p>
              <p className="meta-label">entity_id: {claim.entity_id ?? "-"} · document_id: {claim.document_id ?? "-"}</p>
              <p style={{ margin: "4px 0" }}><strong>{claim.claim_value}</strong></p>
              <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 8px" }}>{claim.claim_text}</p>
              <p style={{ margin: "0 0 8px" }}>
                <span className="badge badge-review">{claim.status}</span>{" "}
                <span className="badge">confidence: {claim.confidence}</span>{" "}
                <span className="badge">last_verified_at: {claim.last_verified_at ?? "확인 필요"}</span>
              </p>
              <p className="meta-label">contributor_hash: {claim.contributor_hash ?? "-"} · AI: {[claim.ai_provider, claim.ai_model].filter(Boolean).join(" / ") || "-"}</p>
              {(claim.source_candidates?.length ?? 0) > 0 && <p className="meta-label">source 후보: {claim.source_candidates?.map((s: {title?: string; url?: string; source_type?: string}) => s.title ?? s.url ?? s.source_type).join(", ")}</p>}
              {(claim.source_trust_scores?.length ?? 0) > 0 && <p className="meta-label">trust scores: {claim.source_trust_scores?.map((s: {id?: string; score?: number}) => `${s.id}:${s.score}`).join(", ")}</p>}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Link href={claim.verify_url ?? `/admin/verify-claim${slug ? `?slug=${slug}` : ""}`} style={primaryButtonStyle}>
                  → 출처 추가 + verified 승격
                </Link>
                {claim.document_url && (
                  <a href={claim.document_url} target="_blank" rel="noopener noreferrer" style={secondaryButtonStyle}>
                    문서 보기 ↗
                  </a>
                )}
              </div>
            </div>
          );
        })}

        {/* Priority 2: approved candidates */}
        <h3 style={{ margin: "24px 0 12px" }}>2순위 · approved candidate 공개 등록</h3>
        {(data?.priorities.approved_candidates.length ?? 0) === 0 && (
          <p style={{ color: "#6b7280" }}>✓ 공개 등록 대기 중인 approved candidate가 없습니다.</p>
        )}
        {data?.priorities.approved_candidates.map((candidate) => (
          <div className="claim-card" key={candidate.id} style={{ borderLeft: "3px solid #fde68a" }}>
            <p className="eyebrow">
              {candidate.category} ·{" "}
              <span style={{ color: RISK_COLOR[candidate.risk_tier] ?? "#374151" }}>
                risk: {candidate.risk_tier}
              </span>
            </p>
            <p style={{ margin: "4px 0" }}><strong>{candidate.title}</strong></p>
            <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 8px" }}>
              {candidate.lang}/wiki/{candidate.slug}
            </p>
            <p style={{ margin: "0 0 8px" }}><span className="badge badge-review">{candidate.status}</span></p>
            <Link href="/admin/candidates" style={{ fontSize: 13, fontWeight: 600, color: "#2563eb" }}>
              → 공개 등록하러 가기
            </Link>
          </div>
        ))}

        <h3>Generated candidates · 공개 등록 대기</h3>
        {(data?.priorities.generated_candidates.length ?? 0) === 0 && <p>공개 등록 대기 중인 generated candidate가 없습니다.</p>}
        {data?.priorities.generated_candidates.map((candidate) => (
          <div className="claim-card" key={candidate.id}>
            <p className="eyebrow">{candidate.category} · risk: <span style={{ color: RISK_COLOR[candidate.risk_tier] ?? "#374151" }}>{candidate.risk_tier}</span></p>
            <p><strong>{candidate.title}</strong></p>
            <p>{candidate.lang}/wiki/{candidate.slug}</p>
            <p><span className="badge badge-review">{candidate.status}</span></p>
            <Link href="/admin/candidates" style={primaryButtonStyle}>공개 등록하러 가기</Link>
          </div>
        ))}
      </section>

      <section className="registry-panel" aria-labelledby="posts-title">
        <h2 id="posts-title">Pending community posts</h2>
        <p><Link href="/admin/posts?status=pending" style={primaryButtonStyle}>글 관리</Link></p>
        {(data?.community_posts.pending.length ?? 0) === 0 && <p>검토 대기 중인 커뮤니티 글이 없습니다.</p>}
        {data?.community_posts.pending.map((post) => (
          <div className="claim-card" key={post.id}>
            <p className="eyebrow">{post.author_type} · {post.author_name ?? "anonymous"} · {post.created_at ?? "created_at 없음"}</p>
            <p>{post.content}</p>
          </div>
        ))}
      </section>

      <section className="registry-panel" aria-labelledby="candidates-title">
        <h2 id="candidates-title">New / approved topic candidates</h2>
        <div className="stat-strip">
          <div className="stat"><span className="stat-num">{counts.candidates_new}</span><span className="stat-label">new candidates</span></div>
          <div className="stat"><span className="stat-num">{counts.candidates_generated}</span><span className="stat-label">generated candidates</span></div>
        </div>
        <h3>New candidates</h3>
        <p><Link href="/admin/candidates?status=new" style={primaryButtonStyle}>후보 검토</Link></p>
        {(data?.priorities.new_candidates.length ?? 0) === 0 && <p>신규 후보가 없습니다.</p>}
        {data?.priorities.new_candidates.map((candidate) => <CandidateCard candidate={candidate} key={candidate.id} />)}
      </section>

      <section className="registry-panel" aria-labelledby="promoted-title">
        <h2 id="promoted-title">Recently promoted documents</h2>
        {(data?.promoted_documents.length ?? 0) === 0 && <p>최근 promoted candidate가 없습니다.</p>}
        {data?.promoted_documents.map((doc) => (
          <div className="claim-card" key={doc.id}>
            <p className="eyebrow">{doc.category} · risk: <span style={{ color: RISK_COLOR[doc.risk_tier] ?? "#374151" }}>{doc.risk_tier}</span> · {doc.promoted_at ?? "promoted_at 없음"}</p>
            <p><strong>{doc.title}</strong></p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Link href={doc.verify_url ?? `/admin/verify-claim?slug=${encodeURIComponent(doc.slug)}`} style={primaryButtonStyle}>claim 검증</Link>
              {doc.public_url && <a href={doc.public_url} target="_blank" rel="noopener noreferrer" style={secondaryButtonStyle}>문서 보기</a>}
            </div>
          </div>
        ))}
      </section>

      {/* Engagement metrics */}
      <section className="registry-panel" aria-labelledby="engagement-title">
        <h2 id="engagement-title">인용 현황 (AI 픽업 계측)</h2>
        <div className="stat-strip">
          <div className="stat"><span className="stat-num">{data?.engagement?.total_human_views ?? 0}</span><span className="stat-label">human views</span></div>
          <div className="stat"><span className="stat-num">{data?.engagement?.total_bot_views ?? 0}</span><span className="stat-label">bot views</span></div>
          <div className="stat"><span className="stat-num">{data?.engagement?.total_ai_crawler_views ?? 0}</span><span className="stat-label">AI crawler views</span></div>
          <div className="stat"><span className="stat-num">{data?.engagement?.total_api_cite_calls ?? 0}</span><span className="stat-label">/api/cite calls</span></div>
          <div className="stat"><span className="stat-num">{data?.engagement?.total_citation_copy_clicks ?? 0}</span><span className="stat-label">citation copy clicks</span></div>
          <div className="stat"><span className="stat-num">{data?.engagement?.total_report_submissions ?? 0}</span><span className="stat-label">report submissions</span></div>
        </div>
        <p className="meta-label">{data?.engagement?.monetization_boundary ?? "Sponsored content and verified fact integrity remain separate."}</p>
        <h3>인용 많은 문서 Top</h3>
        {(data?.engagement?.top_cited.length ?? 0) === 0 && (
          <p style={{ color: "#6b7280" }}>아직 집계된 AI 인용이 없습니다. 인용은 POST /api/documents/&lt;slug&gt;/cite로 증가합니다.</p>
        )}
        {data?.engagement?.top_cited.map((doc) => (
          <div className="claim-card" key={doc.document_id}>
            <p><strong>{doc.title}</strong></p>
            <p>
              <span className="badge badge-verified">✦ AI 인용 {doc.ai_citation_count}</span>{" "}
              <span className="badge">👤 human {doc.human_view_count}</span>{" "}
              <span className="badge">🤖 bot {doc.bot_view_count}</span>{" "}
              <span className="badge">✦ AI crawler {doc.ai_crawler_view_count}</span>{" "}
              <span className="badge">API cite {doc.api_cite_count}</span>{" "}
              <span className="badge">copy {doc.citation_copy_count}</span>{" "}
              <span className="badge">reports {doc.report_submission_count}</span>
            </p>
            {doc.public_url && <a href={doc.public_url} target="_blank" rel="noopener noreferrer">문서 보기</a>}
          </div>
        ))}
      </section>

      {/* Verified documents + staleness alerts */}
      <section className="registry-panel" id="verified-documents" aria-labelledby="verified-title">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 id="verified-title" style={{ margin: 0 }}>Recently verified documents</h2>
          {staleDocCount > 0 && (
            <span className="badge badge-review">⏳ 재검증 필요 {staleDocCount}건</span>
          )}
        </div>
        {staleDocCount > 0 && (
          <p style={{ color: "#92400e", marginBottom: 16 }}>
            신선도가 만료된(180일 경과) 문서는 AI가 인용을 회피할 수 있습니다. 우선 재검증을 진행하세요.
          </p>
        )}
        {(data?.verified_documents.length ?? 0) === 0 && <p>외부 공유 가능한 verified 문서가 없습니다.</p>}
        <ul className="link-list">
          {data?.verified_documents.map((doc) => {
            const stale = isStale(doc.last_verified_at);
            const age = ageInDays(doc.last_verified_at);
            return (
              <li key={doc.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <strong>{doc.title}</strong>
                  <br />
                  {doc.public_url ? (
                    <a href={doc.public_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13 }}>
                      {doc.public_url}
                    </a>
                  ) : (
                    <span style={{ fontSize: 13, color: "#9ca3af" }}>공유 링크 없음</span>
                  )}
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  {age !== null ? (
                    <span className={stale ? "badge badge-review" : "badge badge-verified"}>
                      {stale ? `⏳ ${age}일 경과 · 재검증` : `✓ ${age}일 전`}
                    </span>
                  ) : (
                    <span className="badge">last_verified_at 없음</span>
                  )}
                  {stale && (
                    <div style={{ marginTop: 4 }}>
                      <Link href={doc.verify_url ?? `/admin/verify-claim?slug=${encodeURIComponent(doc.slug)}`} style={{ fontSize: 12, color: "#991b1b" }}>
                        재검증하기 →
                      </Link>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="registry-panel" aria-labelledby="high-risk-title">
        <h2 id="high-risk-title">High-risk categories: finance · healthcare · legal · realtime</h2>
        <p>고위험 항목은 verified 전까지 AI가 사실로 인용하지 않도록 우선 검증합니다.</p>
        {(data?.high_risk.candidates.length ?? 0) === 0 && (data?.high_risk.documents.length ?? 0) === 0 && <p>현재 고위험 운영 큐가 비어 있습니다.</p>}
        {data?.high_risk.candidates.map((candidate) => <CandidateCard candidate={candidate} key={candidate.id} />)}
        {data?.high_risk.documents.map((doc) => (
          <div className="claim-card" key={doc.claim_id ?? doc.slug}>
            <p className="eyebrow">{doc.category} · {doc.field_path}</p>
            <p><strong>{doc.title ?? doc.slug}</strong></p>
            {doc.slug && <Link href={`/admin/verify-claim?slug=${encodeURIComponent(doc.slug)}`} style={primaryButtonStyle}>claim 검증</Link>}
          </div>
        ))}
      </section>

      {/* Admin tools nav */}
      <nav className="registry-panel" aria-labelledby="admin-tools">
        <h2 id="admin-tools">Admin 도구 바로가기</h2>
        <div className="meta-grid">
          {[
            { label: "Claim 검증 큐", href: "/admin/verify-claim", desc: "출처 추가 + verified 승격" },
            { label: "후보 검토", href: "/admin/candidates", desc: "candidate approved 처리" },
            { label: "후보 자동 생성", href: "/admin/generate", desc: "AI 제공자 consensus 생성" },
            { label: "커뮤니티 글 관리", href: "/admin/posts", desc: "pending 글 moderation" },
            { label: "New Entity", href: "/admin/new-entity", desc: "entity stub 생성" },
            { label: "New Document", href: "/admin/new-document", desc: "document stub 생성" },
            { label: "Bulk Import", href: "/admin/import", desc: "JSON 일괄 등록" },
            { label: "공개 현황", href: "/goal", desc: "Mission Control 메트릭" },
          ].map((tool) => (
            <Link key={tool.label} href={tool.href} style={{ textDecoration: "none", color: "inherit" }}>
              <div className="claim-card" style={{ height: "100%" }}>
                <p style={{ fontWeight: 700, margin: "0 0 4px" }}>{tool.label}</p>
                <p className="eyebrow" style={{ margin: 0 }}>{tool.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}

function CandidateCard({ candidate }: { candidate: Candidate }) {
  return (
    <div className="claim-card">
      <p className="eyebrow">{candidate.category} · risk: <span style={{ color: RISK_COLOR[candidate.risk_tier] ?? "#374151" }}>{candidate.risk_tier}</span> · {candidate.status}</p>
      <p><strong>{candidate.title}</strong></p>
      <p>{candidate.lang}/wiki/{candidate.slug}</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Link href="/admin/candidates?status=new" style={primaryButtonStyle}>후보 검토</Link>
        <Link href={`/admin/verify-claim?slug=${encodeURIComponent(candidate.slug)}`} style={secondaryButtonStyle}>claim 검증</Link>
      </div>
    </div>
  );
}
