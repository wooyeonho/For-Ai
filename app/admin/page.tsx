"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { adminApiHeaders, establishAdminSession } from "./AdminSecretProvider";

type DashboardCounts = {
  pending_claim_reviews?: number;
  new_topic_suggestions?: number;
  new_hallucination_reports?: number | null;
  stale_claims?: number;
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
  };
  dashboard?: {
    counts?: DashboardCounts;
    recent_admin_actions?: RecentAdminAction[];
  };
};

const PAGE = { minHeight: "100vh", background: "#f9fafb", padding: "32px 20px", fontFamily: "sans-serif" };
const WRAP = { maxWidth: 1120, margin: "0 auto" };
const PANEL = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 20 };
const GRID = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 };

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

  const cards = useMemo(() => [
    {
      title: "Pending claim reviews",
      count: dashboardCounts?.pending_claim_reviews ?? fallbackCounts?.claims_needs_review,
      href: "/admin/review",
      cta: "Review checklist로 이동",
      detail: "needs_review 상태의 claim을 출처 기반으로 검증합니다.",
      tone: "#2563eb",
    },
    {
      title: "New topic suggestions",
      count: dashboardCounts?.new_topic_suggestions ?? fallbackCounts?.candidates_new,
      href: "/admin/candidates",
      cta: "후보 검토 큐로 이동",
      detail: "AI/시드가 생성한 새 topic candidate를 승인·거절합니다.",
      tone: "#7c3aed",
    },
    {
      title: "New hallucination reports",
      count: dashboardCounts?.new_hallucination_reports,
      href: "/admin/review#today-title",
      cta: "신고 검토 흐름으로 이동",
      detail: countHint(dashboardCounts?.new_hallucination_reports, "새 AI 오답 신고를 claim 수정/재검증으로 전환합니다."),
      tone: "#dc2626",
    },
    {
      title: "Stale claims",
      count: dashboardCounts?.stale_claims,
      href: "/admin/review#verified-documents",
      cta: "재검증 대상 보기",
      detail: "last_verified_at 기준 180일이 지난 verified claim입니다.",
      tone: "#d97706",
    },
    {
      title: "Source check failures",
      count: dashboardCounts?.source_check_failures,
      href: "/admin/verify-claim",
      cta: "출처 보강 페이지로 이동",
      detail: countHint(dashboardCounts?.source_check_failures, "자동 출처 점검 실패 또는 unknown source를 확인합니다."),
      tone: "#b91c1c",
    },
    {
      title: "Business verification requests",
      count: dashboardCounts?.business_verification_requests,
      href: "/api-docs#business-api",
      cta: "Business API 안내 보기",
      detail: countHint(dashboardCounts?.business_verification_requests, "pending business profile/correction 요청입니다."),
      tone: "#047857",
    },
    {
      title: "API abuse warnings",
      count: dashboardCounts?.api_abuse_warnings,
      href: "/api-docs",
      cta: "API 정책 보기",
      detail: countHint(dashboardCounts?.api_abuse_warnings, "최근 rate limit 또는 4xx/5xx 사용량 이상 징후입니다."),
      tone: "#9333ea",
    },
    {
      title: "Recent admin actions",
      count: data?.dashboard?.recent_admin_actions?.length,
      href: "#recent-admin-actions",
      cta: "최근 작업 로그 보기",
      detail: "admin_audit_events에 기록된 최신 운영 작업입니다.",
      tone: "#111827",
    },
  ], [dashboardCounts, data?.dashboard?.recent_admin_actions?.length, fallbackCounts]);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/review", { headers: adminApiHeaders(secret) });
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
          <h1 style={{ margin: 0, fontSize: 30 }}>Claim-level operations dashboard</h1>
          <p style={{ color: "#4b5563", lineHeight: 1.6, maxWidth: 760 }}>
            흩어진 관리 화면을 한 곳에서 시작합니다. 모든 카드는 관련 관리 페이지로 바로 이동하며,
            verified 승격은 반드시 출처와 사람 검토를 거칩니다.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input aria-label="Admin secret" type="password" value={secret} onChange={(event) => { setSecret(event.target.value); void establishAdminSession(event.target.value); }} placeholder="ADMIN_SECRET" style={{ flex: "1 1 260px", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 10 }} />
            <button onClick={load} disabled={loading} style={{ padding: "10px 16px", border: 0, borderRadius: 10, background: "#111827", color: "#fff", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer" }}>{loading ? "불러오는 중..." : "집계 불러오기"}</button>
          </div>
          {message && <p style={{ color: message.ok ? "#166534" : "#991b1b", marginBottom: 0 }}>{message.text}</p>}
        </header>

        <section aria-label="Admin dashboard cards" style={GRID}>
          {cards.map((card) => (
            <Link key={card.title} href={card.href} style={{ ...PANEL, display: "block", textDecoration: "none", color: "inherit", borderTop: `5px solid ${card.tone}` }}>
              <p style={{ margin: 0, color: "#6b7280", fontSize: 12, fontWeight: 700 }}>{card.title}</p>
              <div style={{ margin: "10px 0", fontSize: 36, fontWeight: 800, color: card.tone }}>{displayCount(card.count)}</div>
              <p style={{ minHeight: 44, margin: "0 0 14px", color: "#4b5563", fontSize: 13, lineHeight: 1.5 }}>{card.detail}</p>
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
