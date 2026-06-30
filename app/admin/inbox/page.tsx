"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { recommendForCandidate, recommendForClaim, recommendForInboxItem, recommendationBadgeColor, type AdminRecommendation } from "../../../lib/admin-recommendations";
import { AdminSecretField, useAdminSecret } from "../AdminSecretProvider";

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
  source_candidates?: { title?: string; url?: string; source_type?: string }[];
  source_trust_scores?: { id: string; score: number }[];
  verify_url?: string | null;
  documents?: { title?: string | null; slug?: string | null; lang?: string | null } | null;
};

type Candidate = {
  id: string;
  title: string;
  slug: string;
  lang: string;
  category: string;
  risk_tier: string;
  status: string;
};

type InboxPayload = {
  community_posts?: { pending?: PendingCommunityPost[] };
  priorities?: {
    needs_review_claims?: PriorityClaim[];
    new_candidates?: Candidate[];
    approved_candidates?: Candidate[];
    generated_candidates?: Candidate[];
  };
};

const primaryButtonStyle = { padding: "8px 12px", borderRadius: 8, background: "#111827", color: "#fff", textDecoration: "none", display: "inline-block", fontWeight: 700 };
const secondaryButtonStyle = { padding: "8px 12px", borderRadius: 8, background: "#f3f4f6", color: "#111827", textDecoration: "none", display: "inline-block", fontWeight: 700 };

function RecommendationCallout({ recommendation }: { recommendation: AdminRecommendation }) {
  const color = recommendationBadgeColor(recommendation.tone);
  return (
    <div style={{ margin: "8px 0", padding: "10px 12px", borderRadius: 8, background: color.background, border: `1px solid ${color.border}`, color: color.color }}>
      <strong>추천 action: {recommendation.action}</strong> · {recommendation.label}
      <p style={{ margin: "4px 0 0", fontSize: 13 }}>{recommendation.reason}</p>
    </div>
  );
}

export default function AdminInboxPage() {
  const { adminSecret, setAdminSecret, resetAdminSecret } = useAdminSecret();
  const [data, setData] = useState<InboxPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    const res = await fetch("/api/admin/review", { headers: { "x-admin-secret": adminSecret } });
    const payload = await res.json();
    setLoading(false);
    if (res.ok) {
      setData(payload);
      setMessage({ ok: true, text: "운영 inbox를 불러왔습니다." });
    } else {
      setMessage({ ok: false, text: payload.error ?? "운영 inbox 조회 실패" });
    }
  }, [adminSecret]);

  const inboxItems = useMemo(() => {
    const claims = data?.priorities?.needs_review_claims ?? [];
    const posts = data?.community_posts?.pending ?? [];
    const candidates = [
      ...(data?.priorities?.new_candidates ?? []),
      ...(data?.priorities?.approved_candidates ?? []),
      ...(data?.priorities?.generated_candidates ?? []),
    ];
    return { claims, posts, candidates, total: claims.length + posts.length + candidates.length };
  }, [data]);

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", padding: "40px 20px" }}>
      <header className="registry-panel">
        <p className="eyebrow">Rule-based admin assistant</p>
        <h1>운영 Inbox · 추천 action</h1>
        <p>
          운영자가 처리해야 할 claim, community post, topic candidate를 한 곳에 모아
          add_source, verify_claim, reject_duplicate, mark_spam, recheck_stale, promote_candidate 중 다음 action을 추천합니다.
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <AdminSecretField adminSecret={adminSecret} setAdminSecret={setAdminSecret} resetAdminSecret={resetAdminSecret} inputStyle={{ flex: 1, padding: 10 }} />
          <button onClick={load} disabled={loading}>{loading ? "불러오는 중..." : "Inbox 불러오기"}</button>
        </div>
        {message && <p style={{ marginTop: 8, color: message.ok ? "#166534" : "#991b1b" }}>{message.text}</p>}
      </header>

      <section className="registry-panel">
        <h2>처리 대상 {inboxItems.total}건</h2>
        {!data && <p>ADMIN_SECRET을 입력하고 inbox를 불러오면 추천 action이 표시됩니다.</p>}
        {data && inboxItems.total === 0 && <p>현재 처리할 운영 inbox item이 없습니다.</p>}
      </section>

      <section className="registry-panel" aria-labelledby="claim-inbox-title">
        <h2 id="claim-inbox-title">Claim 검증 Inbox</h2>
        {inboxItems.claims.length === 0 && <p>검증 대기 claim이 없습니다.</p>}
        {inboxItems.claims.map((claim) => {
          const doc = Array.isArray(claim.documents) ? claim.documents[0] : claim.documents;
          const slug = doc?.slug;
          return (
            <div className="claim-card" key={claim.id}>
              <p className="eyebrow">{doc?.title ?? slug ?? claim.id} · {claim.field_path}</p>
              <p><strong>{claim.claim_value}</strong></p>
              <p style={{ color: "#6b7280", fontSize: 13 }}>{claim.claim_text}</p>
              <p><span className="badge badge-review">{claim.status}</span> <span className="badge">confidence: {claim.confidence}</span></p>
              <RecommendationCallout recommendation={recommendForClaim(claim)} />
              <Link href={claim.verify_url ?? `/admin/verify-claim${slug ? `?slug=${encodeURIComponent(slug)}` : ""}`} style={primaryButtonStyle}>검증 화면으로 이동</Link>
            </div>
          );
        })}
      </section>

      <section className="registry-panel" aria-labelledby="post-inbox-title">
        <h2 id="post-inbox-title">Community Post Inbox</h2>
        {inboxItems.posts.length === 0 && <p>검토 대기 글이 없습니다.</p>}
        {inboxItems.posts.map((post) => (
          <div className="claim-card" key={post.id}>
            <p className="eyebrow">{post.author_type} · {post.author_name ?? "anonymous"} · {post.created_at ?? "created_at 없음"}</p>
            <p>{post.content}</p>
            <RecommendationCallout recommendation={recommendForInboxItem(post)} />
            <Link href="/admin/posts?status=pending" style={secondaryButtonStyle}>글 관리로 이동</Link>
          </div>
        ))}
      </section>

      <section className="registry-panel" aria-labelledby="candidate-inbox-title">
        <h2 id="candidate-inbox-title">Topic Candidate Inbox</h2>
        {inboxItems.candidates.length === 0 && <p>검토 대기 후보가 없습니다.</p>}
        {inboxItems.candidates.map((candidate) => (
          <div className="claim-card" key={candidate.id}>
            <p className="eyebrow">{candidate.category} · risk: {candidate.risk_tier} · {candidate.status}</p>
            <p><strong>{candidate.title}</strong></p>
            <p>{candidate.lang}/wiki/{candidate.slug}</p>
            <RecommendationCallout recommendation={recommendForCandidate(candidate)} />
            <Link href="/admin/candidates" style={primaryButtonStyle}>후보 관리로 이동</Link>
          </div>
        ))}
      </section>
    </div>
  );
}
