"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

type DashboardCounts = {
  pending_community_posts?: number;
  new_topic_suggestions?: number;
  generated_candidates?: number;
  pending_claim_reviews?: number;
  stale_claims?: number;
  source_suggestions?: number | null;
  new_hallucination_reports?: number | null;
  source_check_failures?: number | null;
  business_verification_requests?: number | null;
  api_abuse_warnings?: number | null;
};

type RecentAdminAction = {
  id: string;
  action: string;
  created_at: string;
  metadata?: Record<string, unknown>;
};

type ReviewPayload = {
  counts?: {
    claims_needs_review?: number;
    candidates_new?: number;
    candidates_generated?: number;
  };
  dashboard?: {
    counts?: DashboardCounts;
    recent_admin_actions?: RecentAdminAction[];
  };
};

const PAGE = { minHeight: "100vh", background: "#f9fafb", padding: "32px 20px", fontFamily: "sans-serif" };
const WRAP = { maxWidth: 1120, margin: "0 auto" };
const PANEL = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 20 };
const GRID = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 };

function displayCount(value: number | null | undefined) {
  return value == null ? "—" : value.toLocaleString("ko-KR");
}

function countHint(value: number | null | undefined, fallback: string) {
  return value == null ? "테이블 또는 집계가 아직 연결되지 않았습니다." : fallback;
}

export default function AdminDashboardPage() {
  const [secret, setSecret] = useState("");
  const [data, setData] = useState<ReviewPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const dashboardCounts = data?.dashboard?.counts;
  const fallbackCounts = data?.counts;

  const todayCards = useMemo(() => [
    {
      title: "커뮤니티 글 승인 대기",
      adminLabel: "pending community posts",
      count: dashboardCounts?.pending_community_posts,
      href: "/admin/posts?status=pending",
      cta: "글 관리로 이동",
      description: "사용자가 올린 공개 글을 승인하거나 숨깁니다.",
      outcome: "처리하면 스팸·부정확한 제출물이 공개 화면에 노출되는 일을 줄입니다.",
      risk: "높음",
      priority: 1,
      tone: "#dc2626",
    },
    {
      title: "AI 오답 신고",
      adminLabel: "hallucination reports",
      count: dashboardCounts?.new_hallucination_reports,
      href: "/admin/review#today-title",
      cta: "신고 검토",
      description: countHint(dashboardCounts?.new_hallucination_reports, "AI가 잘못 인용했거나 틀린 답을 했다는 신고입니다."),
      outcome: "처리하면 잘못된 claim을 재검증하거나 수정 큐로 넘길 수 있습니다.",
      risk: "높음",
      priority: 2,
      tone: "#b91c1c",
    },
    {
      title: "검증 대기 claim",
      adminLabel: "needs_review claims",
      count: dashboardCounts?.pending_claim_reviews ?? fallbackCounts?.claims_needs_review,
      href: "/admin/review#today-title",
      cta: "claim 검증",
      description: "사람 검토와 출처 확인이 필요한 claim입니다.",
      outcome: "처리하면 출처가 붙은 claim만 verified로 승격되어 AI가 더 안전하게 인용할 수 있습니다.",
      risk: "높음",
      priority: 3,
      tone: "#ea580c",
    },
    {
      title: "오래된 검증",
      adminLabel: "stale verified claims",
      count: dashboardCounts?.stale_claims,
      href: "/admin/review#verified-documents",
      cta: "재검증",
      description: "마지막 검증 후 180일이 지났거나 검증일이 없는 verified claim입니다.",
      outcome: "처리하면 오래된 사실을 최신 출처로 다시 확인해 인용 신뢰도를 유지합니다.",
      risk: "중간",
      priority: 4,
      tone: "#d97706",
    },
    {
      title: "출처 후보",
      adminLabel: "source suggestions",
      count: dashboardCounts?.source_suggestions ?? dashboardCounts?.source_check_failures,
      href: "/admin/verify-claim",
      cta: "출처 보강",
      description: countHint(dashboardCounts?.source_suggestions ?? dashboardCounts?.source_check_failures, "claim에 연결할 후보 출처나 확인이 필요한 출처입니다."),
      outcome: "처리하면 claim마다 추적 가능한 근거가 생겨 verified 판단이 쉬워집니다.",
      risk: "중간",
      priority: 5,
      tone: "#2563eb",
    },
    {
      title: "생성된 후보",
      adminLabel: "generated candidates",
      count: dashboardCounts?.generated_candidates ?? fallbackCounts?.candidates_generated,
      href: "/admin/candidates?status=generated",
      cta: "후보 공개 검토",
      description: "AI가 초안을 만든 뒤 운영자 판단을 기다리는 topic candidate입니다.",
      outcome: "처리하면 공개 등록할 후보와 버릴 후보를 분리해 검증 업무로 넘깁니다.",
      risk: "중간",
      priority: 6,
      tone: "#7c3aed",
    },
    {
      title: "새 주제 제안",
      adminLabel: "new topic suggestions",
      count: dashboardCounts?.new_topic_suggestions,
      href: "/admin/candidates?status=new",
      cta: "제안 분류",
      description: "아직 검토 전인 새 등록 주제 제안입니다.",
      outcome: "처리하면 운영자가 다룰 가치가 있는 주제만 생성·검증 단계로 보냅니다.",
      risk: "낮음",
      priority: 7,
      tone: "#047857",
    },
  ], [dashboardCounts, fallbackCounts]);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/review", { headers: { "x-admin-secret": secret } });
      const payload = await res.json();
      setData(res.ok ? payload : null);
      setMessage({ ok: res.ok, text: res.ok ? "관리 대시보드 집계를 불러왔습니다." : payload.error ?? "대시보드 조회 실패" });
    } catch {
      setMessage({ ok: false, text: "네트워크 오류" });
    } finally {
      setLoading(false);
    }
  }, [secret]);

  return (
    <div style={PAGE}>
      <main style={WRAP}>
        <header style={{ ...PANEL, marginBottom: 18 }}>
          <p style={{ margin: "0 0 6px", color: "#6b7280", fontSize: 12, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" }}>For-Ai admin</p>
          <h1 style={{ margin: 0, fontSize: 30 }}>오늘 처리할 일</h1>
          <p style={{ color: "#4b5563", lineHeight: 1.6, maxWidth: 760 }}>
            비개발자 운영자가 하루 업무를 바로 시작할 수 있도록 위험도가 높은 작업부터 정렬했습니다.
            각 카드는 숫자, 쉬운 설명, 처리 결과, 바로가기 버튼을 함께 보여줍니다.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input aria-label="Admin secret" type="password" value={secret} onChange={(event) => setSecret(event.target.value)} placeholder="ADMIN_SECRET" style={{ flex: "1 1 260px", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 10 }} />
            <button onClick={load} disabled={loading} style={{ padding: "10px 16px", border: 0, borderRadius: 10, background: "#111827", color: "#fff", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer" }}>{loading ? "불러오는 중..." : "집계 불러오기"}</button>
          </div>
          {message && <p style={{ color: message.ok ? "#166534" : "#991b1b", marginBottom: 0 }}>{message.text}</p>}
        </header>

        <section aria-label="오늘 처리할 일" style={GRID}>
          {todayCards.map((card) => (
            <Link key={card.title} href={card.href} style={{ ...PANEL, display: "block", textDecoration: "none", color: "inherit", borderTop: `5px solid ${card.tone}` }}>
              <p style={{ margin: 0, color: "#6b7280", fontSize: 12, fontWeight: 700 }}>#{card.priority} · {card.adminLabel}</p>
              <h2 style={{ margin: "6px 0", fontSize: 20 }}>{card.title}</h2>
              <div style={{ margin: "10px 0", fontSize: 40, fontWeight: 800, color: card.tone }}>{displayCount(card.count)}</div>
              <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 800, color: card.tone }}>위험도: {card.risk}</p>
              <p style={{ minHeight: 40, margin: "0 0 8px", color: "#4b5563", fontSize: 13, lineHeight: 1.5 }}>{card.description}</p>
              <p style={{ minHeight: 44, margin: "0 0 14px", color: "#111827", fontSize: 13, lineHeight: 1.5 }}><strong>처리하면:</strong> {card.outcome}</p>
              <span style={{ color: card.tone, fontSize: 13, fontWeight: 700 }}>{card.cta} →</span>
            </Link>
          ))}
        </section>

        <section id="recent-admin-actions" style={{ ...PANEL, marginTop: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18 }}>Recent admin actions</h2>
              <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: 13 }}>민감 데이터 없이 action과 안전한 metadata만 보여줍니다.</p>
            </div>
            <Link href="/admin/review" style={{ color: "#2563eb", fontSize: 13, fontWeight: 700 }}>전체 review checklist →</Link>
          </div>
          {(data?.dashboard?.recent_admin_actions?.length ?? 0) === 0 ? (
            <p style={{ color: "#6b7280" }}>ADMIN_SECRET으로 집계를 불러오면 최근 작업 로그가 표시됩니다.</p>
          ) : (
            <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
              {data?.dashboard?.recent_admin_actions?.map((action) => (
                <div key={action.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, background: "#f9fafb" }}>
                  <strong>{action.action}</strong>
                  <span style={{ color: "#6b7280", fontSize: 12 }}> · {new Date(action.created_at).toLocaleString("ko-KR")}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
