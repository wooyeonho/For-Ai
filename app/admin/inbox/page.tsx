"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { recommendForCandidate, recommendForClaim, recommendForCommunityPost, topAdminRecommendations } from "../../../lib/admin-recommendations";
import { useAdminSecret } from "../AdminSecretProvider";

type InboxClaim = {
  id: string;
  entity_id?: string | null;
  document_id?: string | null;
  field_path: string;
  claim_text: string;
  claim_value: string;
  confidence: string;
  status: string;
  last_verified_at?: string | null;
  source_candidates?: { title?: string; url?: string; source_type?: string }[];
  claim_sources?: { title?: string; url?: string; source_type?: string; citation?: string }[];
  verify_url?: string | null;
  documents?: { title?: string | null; slug?: string | null } | { title?: string | null; slug?: string | null }[] | null;
};

type InboxCandidate = { id: string; title: string; slug: string; lang: string; category: string; risk_tier: string; status: string };
type InboxPost = { id: string; author_type: string; author_name?: string | null; content: string; status: string; created_at?: string | null };
type ReviewPayload = {
  community_posts?: { pending?: InboxPost[] };
  priorities?: { needs_review_claims?: InboxClaim[]; new_candidates?: InboxCandidate[]; approved_candidates?: InboxCandidate[]; generated_candidates?: InboxCandidate[] };
};

const buttonStyle = { padding: "8px 12px", borderRadius: 8, background: "#111827", color: "#fff", textDecoration: "none", display: "inline-block", fontWeight: 700 };

function RecommendationList({ recommendations }: { recommendations: { action: string; label: string; reason: string; priority: string; href?: string }[] }) {
  if (recommendations.length === 0) return <p className="meta-label">추천 action 없음</p>;
  return (
    <ul style={{ margin: "8px 0", paddingLeft: 18 }}>
      {recommendations.map((recommendation, index) => (
        <li key={`${recommendation.action}-${index}`}>
          <strong>{recommendation.label}</strong> <span className="badge">{recommendation.priority}</span>
          <br />
          <span style={{ color: "#4b5563", fontSize: 13 }}>{recommendation.reason}</span>
        </li>
      ))}
    </ul>
  );
}

export default function AdminInboxPage() {
  const { adminSecret, setAdminSecret } = useAdminSecret();
  const [data, setData] = useState<ReviewPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const claims = useMemo(() => data?.priorities?.needs_review_claims ?? [], [data]);
  const candidates = useMemo(() => [
    ...(data?.priorities?.approved_candidates ?? []),
    ...(data?.priorities?.generated_candidates ?? []),
    ...(data?.priorities?.new_candidates ?? []),
  ], [data]);
  const posts = useMemo(() => data?.community_posts?.pending ?? [], [data]);
  const topRecommendations = useMemo(() => topAdminRecommendations({ claims, candidates, posts }, 8), [claims, candidates, posts]);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    const res = await fetch("/api/admin/review", { headers: { "x-admin-secret": adminSecret } });
    const payload = await res.json();
    setLoading(false);
    if (res.ok) {
      setData(payload);
      setMessage({ ok: true, text: "Admin inbox 데이터를 불러왔습니다." });
    } else {
      setMessage({ ok: false, text: payload.error ?? "Admin inbox 조회 실패" });
    }
  }, [adminSecret]);

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", padding: "40px 20px" }}>
      <nav style={{ marginBottom: 24, fontSize: 13 }}><Link href="/admin/review">← Admin 운영 콘솔</Link></nav>
      <header className="registry-panel">
        <p className="eyebrow">Admin inbox · rule engine</p>
        <h1>추천 action inbox</h1>
        <p>claim, candidate, community post를 하나의 inbox로 모아 rule engine이 다음 admin action과 이유를 제안합니다.</p>
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <input aria-label="Admin secret" type="password" value={adminSecret} onChange={(event) => setAdminSecret(event.target.value)} placeholder="ADMIN_SECRET" style={{ flex: 1, padding: 10 }} onKeyDown={(e) => e.key === "Enter" && load()} />
          <button onClick={load} disabled={loading}>{loading ? "불러오는 중..." : "Inbox 불러오기"}</button>
        </div>
        {message && <p style={{ color: message.ok ? "#166534" : "#991b1b" }}>{message.text}</p>}
      </header>

      <section className="registry-panel">
        <h2>우선 추천</h2>
        <RecommendationList recommendations={topRecommendations} />
      </section>

      <section className="registry-panel">
        <h2>Claims</h2>
        {claims.length === 0 && <p>검토 대기 claim이 없습니다.</p>}
        {claims.map((claim) => {
          const doc = Array.isArray(claim.documents) ? claim.documents[0] : claim.documents;
          const href = claim.verify_url ?? `/admin/verify-claim${doc?.slug ? `?slug=${encodeURIComponent(doc.slug)}` : ""}`;
          return (
            <div className="claim-card" key={claim.id}>
              <p className="eyebrow">{doc?.title ?? claim.id} · {claim.field_path}</p>
              <p><strong>{claim.claim_value}</strong></p>
              <p style={{ color: "#6b7280", fontSize: 13 }}>{claim.claim_text}</p>
              <RecommendationList recommendations={recommendForClaim(claim, href)} />
              <Link href={href} style={buttonStyle}>처리하기</Link>
            </div>
          );
        })}
      </section>

      <section className="registry-panel">
        <h2>Candidates</h2>
        {candidates.length === 0 && <p>후보 작업이 없습니다.</p>}
        {candidates.map((candidate) => (
          <div className="claim-card" key={candidate.id}>
            <p className="eyebrow">{candidate.category} · {candidate.status} · risk {candidate.risk_tier}</p>
            <p><strong>{candidate.title}</strong> · {candidate.lang}/wiki/{candidate.slug}</p>
            <RecommendationList recommendations={recommendForCandidate(candidate)} />
            <Link href="/admin/candidates" style={buttonStyle}>후보 관리</Link>
          </div>
        ))}
      </section>

      <section className="registry-panel">
        <h2>Community posts</h2>
        {posts.length === 0 && <p>pending post가 없습니다.</p>}
        {posts.map((post) => (
          <div className="claim-card" key={post.id}>
            <p className="eyebrow">{post.author_type} · {post.author_name ?? "anonymous"} · {post.created_at ?? "created_at 없음"}</p>
            <p>{post.content}</p>
            <RecommendationList recommendations={recommendForCommunityPost(post)} />
            <Link href="/admin/posts?status=pending" style={buttonStyle}>글 관리</Link>
          </div>
        ))}
      </section>
    </div>
  );
}
