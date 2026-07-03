"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { ensureAdminSession } from "@/lib/admin-client";

type DashboardCounts = {
  pending_claim_reviews?: number;
  new_topic_suggestions?: number;
  new_hallucination_reports?: number | null;
  stale_claims?: number;
  source_check_failures?: number | null;
  business_verification_requests?: number | null;
  api_abuse_warnings?: number | null;
  ai_citation_watchlist?: number;
};

type PriorityTask = {
  key: string;
  title: string;
  count: number | null;
  risk: "긴급" | "높음" | "중간" | "낮음" | "확인 필요";
  score: number;
  href: string;
  description: string;
  operator_note: string;
};

type RecentAdminAction = {
  id: string;
  action: string;
  created_at: string;
  metadata?: Record<string, unknown>;
};

type ReviewPayload = {
  recommendations?: unknown[];
  counts?: {
    claims_needs_review?: number;
    candidates_new?: number;
  };
  dashboard?: {
    counts?: DashboardCounts;
    priority_tasks?: PriorityTask[];
    recent_admin_actions?: RecentAdminAction[];
  };
};

const PAGE = { minHeight: "100vh", background: "#f9fafb", padding: "32px 20px", fontFamily: "sans-serif" };
const WRAP = { maxWidth: 1120, margin: "0 auto" };
const PANEL = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 20 };
const GRID = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 };
const riskColors: Record<PriorityTask["risk"], string> = { 긴급: "#dc2626", 높음: "#ea580c", 중간: "#d97706", 낮음: "#2563eb", "확인 필요": "#6b7280" };

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
  const priorityTasks = data?.dashboard?.priority_tasks ?? [];
  const firstTask = priorityTasks[0];

  const cards = useMemo(() => [
    {
      title: "통합 Inbox",
      count: dashboardCounts?.new_hallucination_reports ?? fallbackCounts?.candidates_new,
      href: "/admin/inbox",
      cta: "Inbox에서 처리",
      detail: "제보·신고·출처·커뮤니티 글을 한 화면에서 승인·거절·스팸 처리합니다.",
      tone: "#111827",
    },
    {
      title: "검토할 사실",
      count: dashboardCounts?.pending_claim_reviews ?? fallbackCounts?.claims_needs_review,
      href: "/admin/review",
      cta: "검토 목록으로 이동",
      detail: "출처 확인이 필요해 아직 확정하지 않은 사실입니다.",
      tone: "#2563eb",
    },
    {
      title: "새 주제 제안",
      count: dashboardCounts?.new_topic_suggestions ?? fallbackCounts?.candidates_new,
      href: "/admin/candidates",
      cta: "주제 제안 보기",
      detail: "새로 들어온 주제를 공개할지, 보류할지 결정합니다.",
      tone: "#7c3aed",
    },
    {
      title: "새 오답 신고",
      count: dashboardCounts?.new_hallucination_reports,
      href: "/admin/review#today-title",
      cta: "신고 확인하기",
      detail: countHint(dashboardCounts?.new_hallucination_reports, "AI가 틀리게 답했거나 문서가 잘못됐다는 신고입니다."),
      tone: "#dc2626",
    },
    {
      title: "오래된 검증",
      count: dashboardCounts?.stale_claims,
      href: "/admin/review#verified-documents",
      cta: "다시 확인하기",
      detail: "마지막 확인 후 180일이 지나 최신 상태인지 다시 봐야 합니다.",
      tone: "#d97706",
    },
    {
      title: "출처 확인 필요",
      count: dashboardCounts?.source_check_failures,
      href: "/admin/verify-claim",
      cta: "출처 보강하기",
      detail: countHint(dashboardCounts?.source_check_failures, "출처가 없거나 신뢰도를 확인하기 어려운 항목입니다."),
      tone: "#b91c1c",
    },
    {
      title: "사업자 확인 요청",
      count: dashboardCounts?.business_verification_requests,
      href: "/api-docs#business-api",
      cta: "요청 안내 보기",
      detail: countHint(dashboardCounts?.business_verification_requests, "사업자가 직접 정보를 확인하거나 수정해 달라고 요청했습니다."),
      tone: "#047857",
    },
    {
      title: "비정상 사용 알림",
      count: dashboardCounts?.api_abuse_warnings,
      href: "/api-docs",
      cta: "사용 정책 보기",
      detail: countHint(dashboardCounts?.api_abuse_warnings, "짧은 시간에 실패 요청이 많이 발생한 사용 흔적입니다."),
      tone: "#9333ea",
    },
    {
      title: "최근 운영 기록",
      count: data?.dashboard?.recent_admin_actions?.length,
      href: "#recent-admin-actions",
      cta: "운영 기록 보기",
      detail: "운영자가 최근 처리한 작업을 확인합니다.",
      tone: "#111827",
    },
  ], [dashboardCounts, data?.dashboard?.recent_admin_actions?.length, data?.recommendations?.length, fallbackCounts]);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      // If a secret was entered, exchange it for the httpOnly admin session
      // (this also mints the CSRF token cookie); otherwise rely on an existing
      // session. Subsequent requests authenticate via the cookie.
      if (secret.trim()) {
        await ensureAdminSession(secret.trim());
      }
      const res = await fetch("/api/admin/review");
      const payload = await res.json();
      setData(res.ok ? payload : null);
      setMessage({ ok: res.ok, text: res.ok ? "관리 대시보드 집계를 불러왔습니다." : payload.error ?? "대시보드 조회 실패" });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "네트워크 오류" });
    } finally {
      setLoading(false);
    }
  }, [secret]);

  return (
    <div style={PAGE}>
      <main style={WRAP}>
        <header style={{ ...PANEL, marginBottom: 18 }}>
          <p style={{ margin: "0 0 6px", color: "#6b7280", fontSize: 12, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" }}>For-Ai admin</p>
          <h1 style={{ margin: 0, fontSize: 30 }}>Business operating facts 운영 센터</h1>
          <p style={{ color: "#4b5563", lineHeight: 1.6, maxWidth: 760 }}>
            초기 commercial wedge는 business operating facts / reputation correction입니다. verified claims, stale claims, source coverage,
            API usage, business correction requests를 한 화면에서 보고, 사업자 요청은 intake signal로만 처리하며 verified 승격은 반드시 출처와 사람 검토를 거칩니다.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input aria-label="Admin secret" type="password" value={secret} onChange={(event) => setSecret(event.target.value)} placeholder="ADMIN_SECRET" style={{ flex: "1 1 260px", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 10 }} />
            <button onClick={load} disabled={loading} style={{ padding: "10px 16px", border: 0, borderRadius: 10, background: "#111827", color: "#fff", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer" }}>{loading ? "불러오는 중..." : "집계 불러오기"}</button>
          </div>
          {message && <p style={{ color: message.ok ? "#166534" : "#991b1b", marginBottom: 0 }}>{message.text}</p>}
        </header>

        <section aria-labelledby="today-title" style={{ ...PANEL, marginBottom: 18, borderTop: `6px solid ${firstTask ? riskColors[firstTask.risk] : "#111827"}` }}>
          <p style={{ margin: "0 0 6px", color: "#6b7280", fontSize: 12, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" }}>Daily command center</p>
          <h2 id="today-title" style={{ margin: 0, fontSize: 24 }}>오늘 가장 먼저 처리할 일</h2>
          {priorityTasks.length === 0 ? (
            <p style={{ color: "#4b5563", lineHeight: 1.6 }}>ADMIN_SECRET을 입력하고 집계를 불러오면 신고, 위험 주제, AI 인용, 오래된 검증 순서로 오늘의 우선순위가 표시됩니다.</p>
          ) : (
            <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
              {priorityTasks.map((task, index) => (
                <Link key={task.key} href={task.href} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 14, alignItems: "center", padding: 14, border: "1px solid #e5e7eb", borderRadius: 14, background: index === 0 ? "#fff7ed" : "#f9fafb", textDecoration: "none", color: "inherit" }}>
                  <div style={{ width: 38, height: 38, borderRadius: 999, background: riskColors[task.risk], color: "#fff", display: "grid", placeItems: "center", fontWeight: 800 }}>{index + 1}</div>
                  <div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <strong style={{ fontSize: 17 }}>{task.title}</strong>
                      <span style={{ color: riskColors[task.risk], fontSize: 12, fontWeight: 800 }}>위험도 {task.risk}</span>
                      <span style={{ color: "#111827", fontSize: 12, fontWeight: 800 }}>개수 {displayCount(task.count)}</span>
                    </div>
                    <p style={{ margin: "6px 0 2px", color: "#4b5563", lineHeight: 1.5 }}>{task.description}</p>
                    <p style={{ margin: 0, color: "#6b7280", fontSize: 13 }}>{task.operator_note}</p>
                  </div>
                  <span style={{ color: riskColors[task.risk], fontSize: 13, fontWeight: 800, whiteSpace: "nowrap" }}>바로 처리 →</span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section aria-labelledby="business-wedge-metrics" style={{ ...PANEL, marginBottom: 18 }}>
          <p style={{ margin: "0 0 6px", color: "#6b7280", fontSize: 12, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" }}>Initial commercial wedge</p>
          <h2 id="business-wedge-metrics" style={{ margin: 0, fontSize: 22 }}>Business fact integrity dashboard</h2>
          <p style={{ color: "#4b5563", lineHeight: 1.6 }}>
            선택 vertical의 핵심 지표를 하나의 운영 묶음으로 봅니다. 선택하지 않은 civic/transport/travel/health/finance vertical은 future coverage이며 seed generation 우선순위에서 제외됩니다.
          </p>
          <div style={GRID}>
            <Link href="/admin/review" style={{ ...PANEL, display: "block", textDecoration: "none", color: "inherit", borderTop: "5px solid #16a34a" }}>
              <p style={{ margin: 0, color: "#6b7280", fontSize: 12, fontWeight: 700 }}>Verified claims</p>
              <div style={{ margin: "10px 0", fontSize: 34, fontWeight: 800, color: "#16a34a" }}>{displayCount((fallbackCounts?.claims_needs_review ?? 0) === 0 && data ? 0 : null)}</div>
              <p style={{ margin: 0, color: "#4b5563", fontSize: 13 }}>Citation-ready business facts after independent source-backed review.</p>
            </Link>
            <Link href="/admin/review#verified-documents" style={{ ...PANEL, display: "block", textDecoration: "none", color: "inherit", borderTop: "5px solid #d97706" }}>
              <p style={{ margin: 0, color: "#6b7280", fontSize: 12, fontWeight: 700 }}>Stale claims</p>
              <div style={{ margin: "10px 0", fontSize: 34, fontWeight: 800, color: "#d97706" }}>{displayCount(dashboardCounts?.stale_claims)}</div>
              <p style={{ margin: 0, color: "#4b5563", fontSize: 13 }}>{countHint(dashboardCounts?.stale_claims, "Verified business facts due for freshness review.")}</p>
            </Link>
            <Link href="/admin/verify-claim" style={{ ...PANEL, display: "block", textDecoration: "none", color: "inherit", borderTop: "5px solid #b91c1c" }}>
              <p style={{ margin: 0, color: "#6b7280", fontSize: 12, fontWeight: 700 }}>Source coverage gaps</p>
              <div style={{ margin: "10px 0", fontSize: 34, fontWeight: 800, color: "#b91c1c" }}>{displayCount(dashboardCounts?.source_check_failures)}</div>
              <p style={{ margin: 0, color: "#4b5563", fontSize: 13 }}>{countHint(dashboardCounts?.source_check_failures, "Business claims missing acceptable source evidence.")}</p>
            </Link>
            <Link href="/api-docs#business-dashboard-metrics" style={{ ...PANEL, display: "block", textDecoration: "none", color: "inherit", borderTop: "5px solid #9333ea" }}>
              <p style={{ margin: 0, color: "#6b7280", fontSize: 12, fontWeight: 700 }}>API usage</p>
              <div style={{ margin: "10px 0", fontSize: 34, fontWeight: 800, color: "#9333ea" }}>{displayCount(dashboardCounts?.api_abuse_warnings)}</div>
              <p style={{ margin: 0, color: "#4b5563", fontSize: 13 }}>{countHint(dashboardCounts?.api_abuse_warnings, "Usage telemetry tables are not fully connected yet.")}</p>
            </Link>
            <Link href="/admin/business" style={{ ...PANEL, display: "block", textDecoration: "none", color: "inherit", borderTop: "5px solid #047857" }}>
              <p style={{ margin: 0, color: "#6b7280", fontSize: 12, fontWeight: 700 }}>Business correction requests</p>
              <div style={{ margin: "10px 0", fontSize: 34, fontWeight: 800, color: "#047857" }}>{displayCount(dashboardCounts?.business_verification_requests)}</div>
              <p style={{ margin: 0, color: "#4b5563", fontSize: 13 }}>{countHint(dashboardCounts?.business_verification_requests, "Owner-submitted corrections awaiting independent verification.")}</p>
            </Link>
          </div>
        </section>

        <section aria-label="운영 현황 카드" style={GRID}>
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
              <h2 style={{ margin: 0, fontSize: 18 }}>최근 운영 기록</h2>
              <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: 13 }}>민감한 정보 없이 최근 작업 종류와 시간만 보여줍니다.</p>
            </div>
            <Link href="/admin/review" style={{ color: "#2563eb", fontSize: 13, fontWeight: 700 }}>전체 검토 목록 →</Link>
          </div>
          {(data?.dashboard?.recent_admin_actions?.length ?? 0) === 0 ? (
            <p style={{ color: "#6b7280" }}>ADMIN_SECRET으로 집계를 불러오면 최근 운영 기록이 표시됩니다.</p>
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
