import type { Metadata } from "next";
import Link from "next/link";
import { getVerificationQueue } from "@/lib/verification-queue";

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

export default function VerifyQueuePage() {
  const { progress, inProgress, backlog } = getVerificationQueue();

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
