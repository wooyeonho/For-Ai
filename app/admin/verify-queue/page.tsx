import type { Metadata } from "next";
import Link from "next/link";
import { adminClaimActions, adminClaimReviewFields, getVerificationQueue } from "@/lib/verification-queue";

export const metadata: Metadata = {
  title: { absolute: "Verification Queue — For-Ai Admin" },
  robots: { index: false, follow: false },
};

const PAGE: React.CSSProperties = { minHeight: "100vh", background: "#f9fafb", padding: 24, fontFamily: "sans-serif" };
const WRAP: React.CSSProperties = { maxWidth: 920, margin: "0 auto" };
const CARD: React.CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, marginBottom: 12 };
const MONO: React.CSSProperties = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12, background: "#f3f4f6", borderRadius: 6, padding: "2px 6px" };
const CHIP = (bg: string, color: string): React.CSSProperties => ({ fontSize: 11, padding: "2px 8px", borderRadius: 12, fontWeight: 600, background: bg, color });

function CodeBlock({ children }: { children: string }) {
  return (
    <pre style={{ ...MONO, display: "block", padding: "10px 12px", margin: "8px 0 0", overflowX: "auto", whiteSpace: "pre-wrap" }}>{children}</pre>
  );
}

export default function VerifyQueuePage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const { progress, inProgress, backlog, claims } = getVerificationQueue();
  const param = (key: string) => {
    const value = searchParams?.[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const filters = {
    country: param("country") ?? "all",
    domain: param("domain") ?? "all",
    source: param("source") ?? "all",
    confidence: param("confidence") ?? "all",
    status: param("status") ?? "all",
    stale: param("stale") ?? "all",
  };
  const countries = [...new Set(claims.map((claim) => claim.country))].sort();
  const domains = [...new Set(claims.map((claim) => claim.domain))].sort();
  const filteredClaims = claims.filter((claim) => (filters.country === "all" || claim.country === filters.country)
    && (filters.domain === "all" || claim.domain === filters.domain)
    && (filters.source === "all" || (filters.source === "present" ? claim.sourcePresent : !claim.sourcePresent))
    && (filters.confidence === "all" || claim.confidence === filters.confidence)
    && (filters.status === "all" || claim.status === filters.status)
    && (filters.stale === "all" || (filters.stale === "stale" ? claim.stale : !claim.stale)));
  const filterHref = (key: string, value: string) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...filters, [key]: value })) if (v !== "all") params.set(k, v);
    const qs = params.toString();
    return qs ? `/admin/verify-queue?${qs}` : "/admin/verify-queue";
  };

  return (
    <div style={PAGE}>
      <div style={WRAP}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>🗂️ 검증 큐 (Verification Queue)</h1>
          <p style={{ color: "#6b7280", fontSize: 13, margin: "4px 0 0" }}>
            파일 기반 검증 생산 현황. 채우기·승인은 audit 추적을 위해 CLI + git 흐름으로 한다 (
            <span style={MONO}>npm run claims:scaffold</span> → 공식 출처 확인 → fill → <span style={MONO}>npm run claims:validate</span>).
          </p>
        </div>

        {/* Progress summary */}
        <div style={CARD}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "baseline" }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{progress.citationReady}<span style={{ fontSize: 16, color: "#9ca3af" }}> / {progress.totalClaims}</span></div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>citation-ready claims ({progress.readyPercent}%)</div>
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{progress.totalFiles}</div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>verified-claims 파일</div>
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{progress.seedTopics}<span style={{ fontSize: 16, color: "#9ca3af" }}> / {progress.seedClaims}</span></div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>시드 백로그 (토픽 / placeholder claim)</div>
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{backlog.length}</div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>미착수 시드 토픽</div>
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
            {progress.byCountry.map((c) => (
              <span key={c.country} style={CHIP("#eef2ff", "#3730a3")}>
                {c.country} · {c.ready} ready · {c.files} files
              </span>
            ))}
          </div>
        </div>

        <div style={CARD}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 8px" }}>검증 대기 claim 필터</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 12 }}>
            {[["country", countries], ["domain", domains], ["confidence", ["low", "medium", "high"]], ["status", ["needs_review", "verified"]]].map(([key, values]) => (
              <span key={key as string}>
                <strong>{key as string}</strong>: <Link href={filterHref(key as string, "all")}>all</Link> {(values as string[]).map((value) => <Link key={value} href={filterHref(key as string, value)} style={{ marginLeft: 6 }}>{value}</Link>)}
              </span>
            ))}
            <span><strong>source</strong>: <Link href={filterHref("source", "all")}>all</Link> <Link href={filterHref("source", "present")}>present</Link> <Link href={filterHref("source", "missing")}>missing</Link></span>
            <span><strong>stale</strong>: <Link href={filterHref("stale", "all")}>all</Link> <Link href={filterHref("stale", "stale")}>stale</Link> <Link href={filterHref("stale", "fresh")}>fresh</Link></span>
          </div>
          <p style={{ fontSize: 12, color: "#6b7280" }}>표시 중: {filteredClaims.length} / {claims.length} claims</p>
          {filteredClaims.slice(0, 40).map((claim) => (
            <div key={`${claim.documentSlug}-${claim.fieldPath}`} style={{ fontSize: 12, borderTop: "1px solid #f3f4f6", paddingTop: 6, marginTop: 6 }}>
              <span style={MONO}>{claim.documentSlug}</span> · {claim.country} · {claim.domain} · {claim.fieldPath} · {claim.status} · {claim.confidence} · source {claim.sourcePresent ? "present" : "missing"}{claim.stale ? " · stale" : ""}
            </div>
          ))}
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: "16px 0 8px" }}>Claim 승인 화면 필수 정보</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {adminClaimReviewFields.map((field) => <span key={field.key} style={CHIP("#f3f4f6", "#374151")}>{field.label}</span>)}
          </div>
          <h3 style={{ fontSize: 14, margin: "16px 0 8px" }}>관리자 액션과 audit</h3>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#374151" }}>
            {adminClaimActions.map((action, index) => <li key={action.key}>{index + 1}. {action.label} — {action.audit}</li>)}
          </ul>
        </div>

        {/* In progress */}
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: "24px 0 8px" }}>
          진행 중 — placeholder 남은 파일 ({inProgress.length})
        </h2>
        {inProgress.length === 0 ? (
          <div style={{ ...CARD, color: "#6b7280", fontSize: 13 }}>모든 등록 파일의 claim이 citation-ready 상태입니다. ✅</div>
        ) : (
          inProgress.map((f) => (
            <div key={f.slug} style={CARD}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{f.slug}</span>
                <span style={CHIP("#fef9c3", "#a16207")}>{f.ready}/{f.total} ready ({f.country})</span>
              </div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 8 }}>
                미검증 field_path: {f.remaining.map((r) => (<span key={r} style={{ ...MONO, marginRight: 6 }}>{r}</span>))}
              </div>
            </div>
          ))
        )}

        {/* Backlog */}
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: "24px 0 8px" }}>
          미착수 백로그 — 시드 토픽 ({backlog.length})
        </h2>
        <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 12px" }}>
          각 토픽을 scaffold한 뒤 공식 출처를 직접 확인해 채운다. 직접 확인 못 하면 verified로 올리지 않는다.
        </p>
        {backlog.map((t) => (
          <div key={t.slug} style={CARD}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{t.title}</span>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span style={CHIP("#f3f4f6", "#374151")}>{t.category}</span>
                {t.riskTier && <span style={CHIP("#f3f4f6", "#6b7280")}>risk: {t.riskTier}</span>}
                <span style={CHIP("#ecfdf5", "#047857")}>{t.claimCount} claims</span>
                {t.requiredSourceTypes.map((s) => (
                  <span key={s} style={CHIP("#eff6ff", "#1d4ed8")}>{s}</span>
                ))}
              </div>
            </div>
            {t.whyPeopleAskAi && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>{t.whyPeopleAskAi}</div>}
            <CodeBlock>{`npm run claims:scaffold -- ${t.slug} --country KR --lang ko`}</CodeBlock>
          </div>
        ))}

        <div style={{ marginTop: 24, fontSize: 12, color: "#9ca3af" }}>
          <Link href="/admin/candidates" style={{ color: "#2563eb" }}>→ Supabase 후보 큐 (/admin/candidates)</Link>
          {"  ·  "}
          읽기 전용. 쓰기형 승인 워크플로는 Supabase 큐를 연결하면 활성화된다.
        </div>
      </div>
    </div>
  );
}
