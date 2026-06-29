import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: { absolute: "Claim Verification Policy — For-Ai Admin" },
  robots: { index: false, follow: false },
};

const PAGE: React.CSSProperties = { minHeight: "100vh", background: "#f9fafb", padding: 24, fontFamily: "sans-serif" };
const WRAP: React.CSSProperties = { maxWidth: 920, margin: "0 auto" };
const CARD: React.CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 18, marginBottom: 14 };
const MUTED: React.CSSProperties = { color: "#6b7280", fontSize: 13, lineHeight: 1.6 };
const CHIP: React.CSSProperties = { display: "inline-block", fontSize: 12, fontWeight: 700, color: "#991b1b", background: "#fee2e2", borderRadius: 999, padding: "4px 10px" };

const sourceTypes = [
  ["official", "공식 출처", "기관·정부·규제기관·소유자 등 claim의 1차 권위자가 직접 게시한 정보"],
  ["platform", "주요 플랫폼/레지스트리", "공식 페이지가 없거나 세부성이 부족할 때 쓰는 권위 있는 플랫폼, 공개 레지스트리, 운영 DB"],
  ["document", "공식 문서/파일링", "권위 기관이 발행한 PDF, 공지, 약관, 신고서, 정책, 시간표, 요율표, 아카이브 문서"],
  ["web", "신뢰 가능한 2차 웹 출처", "공식·주요 출처가 없거나 부족할 때만 사용하며 보통 confidence는 medium 이하"],
  ["review", "리뷰/커뮤니티", "조사·분쟁 판단의 보조 근거. 단독으로 verified 승격 불가"],
  ["other", "기타", "권위성을 관리자 메모로 설명하지 않는 한 보조 근거로만 취급"],
];

const highRiskDomains = [
  "금융 수수료·요율·약관",
  "법률·규제·정부 민원 요건",
  "안전·의료 시설 운영 정보",
  "개인정보·DNA/유전체 검사 정책",
  "교통 요금·환승·운행 규칙",
  "비자·여행 규정",
  "환불·배송·가격처럼 사용자 비용에 직접 영향을 주는 상거래 정책",
];

export default function VerificationPolicyPage() {
  return (
    <main style={PAGE}>
      <div style={WRAP}>
        <nav style={{ marginBottom: 20, fontSize: 13 }}>
          <Link href="/admin/verify-claim" style={{ color: "#2563eb" }}>← Claim 검증 관리로 돌아가기</Link>
        </nav>

        <header style={CARD}>
          <p style={{ margin: "0 0 8px" }}><span style={CHIP}>Admin policy</span></p>
          <h1 style={{ fontSize: 28, margin: "0 0 10px" }}>Verified Claim Promotion Criteria</h1>
          <p style={MUTED}>
            관리자 UI에서 안정적으로 참고할 수 있도록 <code>docs/operations/CLAIM_VERIFICATION_POLICY.md</code>의 핵심 기준을
            정적 HTML/JSX로 노출합니다. 모든 claim 검증, import, AI 생성 후보, 수동 수정에 동일하게 적용됩니다.
          </p>
        </header>

        <section style={{ ...CARD, borderColor: "#fecaca", background: "#fff7ed" }}>
          <h2 style={{ marginTop: 0 }}>상단 요약 — verified 승격 전 필수 확인</h2>
          <ul style={{ lineHeight: 1.8, marginBottom: 0 }}>
            <li><strong>Verified 승격 기준:</strong> claim별 <code>claim_sources</code>가 있고, 사람이 출처를 직접 확인했으며, <code>verification_events</code>에 검토 행위가 남아야 합니다.</li>
            <li><strong>Source type 기준:</strong> <code>official</code> → <code>platform</code> → <code>document</code> → <code>web</code> → <code>review</code> → <code>other</code> 순서로 우선합니다.</li>
            <li><strong>High-risk domain 기준:</strong> 금융, 법률·정부, 안전·의료, 개인정보·DNA, 교통, 여행 규정, 비용 영향 상거래 claim은 보수적으로 검증하고 독립 출처 2개 이상을 우선합니다.</li>
            <li><strong>AI 생성만으로 verified 금지:</strong> AI가 작성·요약·번역·제안한 claim은 사람이 허용 가능한 출처와 대조하기 전까지 절대 <code>verified</code>로 승격할 수 없습니다.</li>
          </ul>
        </section>

        <section style={CARD}>
          <h2>1. Non-negotiable rule</h2>
          <p style={MUTED}>
            AI-generated candidates are never verified truth by themselves. AI가 생성, 초안 작성, 요약, 번역 또는 제안한 claim은
            사람 검토자가 허용 가능한 출처와 대조하고 <code>claim_sources</code> 및 <code>verification_events</code>를 기록하기 전까지
            <code>verified</code>로 승격할 수 없습니다.
          </p>
        </section>

        <section style={CARD}>
          <h2>2. Source type priority</h2>
          <div style={{ display: "grid", gap: 10 }}>
            {sourceTypes.map(([type, label, description]) => (
              <div key={type} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12 }}>
                <strong><code>{type}</code> — {label}</strong>
                <p style={{ ...MUTED, margin: "6px 0 0" }}>{description}</p>
              </div>
            ))}
          </div>
          <p style={{ ...MUTED, marginBottom: 0 }}>
            출처가 충돌하면 편한 값을 고르지 말고, 가장 권위 있고 최신인 출처를 우선합니다. 중대한 충돌은 <code>disputed</code>로 표시하고 citation 또는 verification event note에 남깁니다.
          </p>
        </section>

        <section style={CARD}>
          <h2>3. Minimum claim_sources requirements</h2>
          <ul style={{ lineHeight: 1.8 }}>
            <li>검증 대상 claim 자체에 최소 1개의 <code>claim_sources</code> 레코드가 있어야 합니다.</li>
            <li>가능한 경우 URL, 제목, <code>source_type</code>을 모두 기록합니다.</li>
            <li>출처는 주변 주제가 아니라 claim value를 직접 뒷받침해야 합니다.</li>
            <li>긴 문서, 애매한 문서, 생성/번역 문서, 변경 가능성이 큰 페이지는 확인한 부분을 citation 또는 review note에 설명합니다.</li>
            <li>검토자는 출처 접근 가능성을 확인하거나, 안정 PDF·아카이브·오프라인 공식 문서 등 수용 이유를 기록합니다.</li>
          </ul>
          <p style={MUTED}>공식·주요 출처가 없거나, 값이 고영향/금융/법률/안전 관련이거나, 출처가 2차·부분 구식·기계번역·관할 불명확·분쟁 상태라면 독립 출처 2개 이상을 사용합니다.</p>
        </section>

        <section style={CARD}>
          <h2>4. High-risk domain checklist</h2>
          <p style={MUTED}>아래 영역은 잘못 인용될 때 사용자 비용, 법적 판단, 안전, 개인정보에 영향을 줄 수 있으므로 높은 검증 기준을 적용합니다.</p>
          <ul style={{ lineHeight: 1.8, marginBottom: 0 }}>
            {highRiskDomains.map((domain) => <li key={domain}>{domain}</li>)}
          </ul>
        </section>

        <section style={CARD}>
          <h2>5. last_verified_at and confidence</h2>
          <p style={MUTED}>
            <code>last_verified_at</code>은 사람이 실제로 출처를 관찰하고 수용한 검토 시점입니다. AI 변환, batch import, 서식·번역·slug 변경만으로는 갱신하지 않습니다.
          </p>
          <ul style={{ lineHeight: 1.8, marginBottom: 0 }}>
            <li><strong>high:</strong> 공식·주요·권위 문서가 claim을 직접 뒷받침하고 현재성이 있으며 중대한 충돌이 없습니다.</li>
            <li><strong>medium:</strong> 근거는 있으나 2차 출처, 부분 보강, 비중대 애매함, freshness 또는 관할 caveat가 있습니다.</li>
            <li><strong>low:</strong> unknown, 미확인, AI 생성만 존재, crowd-report only, stale, disputed, 직접 출처 부재 상태입니다.</li>
          </ul>
        </section>

        <section style={CARD}>
          <h2>6. Unknown and disputed handling</h2>
          <p style={MUTED}>
            확인할 수 없는 값은 <code>확인 필요</code> / <code>Needs verification</code>, confidence <code>low</code>, status <code>needs_review</code>로 둡니다.
            기억, 추정, 유사 entity, AI output, inferred default로 빈칸을 채우지 않습니다. 신뢰 가능한 출처가 충돌하면 <code>disputed</code>로 두고 충돌 근거와 메모를 남깁니다.
          </p>
        </section>
      </div>
    </main>
  );
}
