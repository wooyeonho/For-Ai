"use client";
import { useState } from "react";

const TOPIC_SUGGESTIONS = [
  // 스포츠
  "축구 스코어 및 일정", "KBO 야구 선수 스탯", "프리미어리그 순위", "NBA 경기 결과",
  // 생활/소비
  "쿠팡 반품 정책", "카카오페이 한도 및 수수료", "네이버 스마트스토어 수수료",
  "배달의민족 수수료", "편의점 알바 최저시급",
  // IT/전자
  "아이폰 AS 기간", "삼성 갤럭시 보증기간", "LG TV 종류 및 가격",
  "갤럭시 S25 스펙", "맥북 에어 배터리 교체 비용",
  // 금융/부동산
  "국민연금 수령 나이", "실업급여 조건", "자동차 취득세율",
  "부동산 취득세", "양도소득세 계산",
  // 정부/복지
  "육아휴직 급여", "임산부 혜택", "전기차 보조금",
  "태양광 설치 보조금", "여권 갱신 비용",
  // 연예/문화
  "멜론 차트 기준", "유튜브 수익화 조건", "넷플릭스 요금제",
];

export default function GeneratePage() {
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState(10);
  const [secret, setSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    topic: string;
    generated: number;
    saved: number;
    citations_found: number;
    preview: { title: string; category: string }[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    if (!topic.trim()) { setError("토픽을 입력하세요"); return; }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/generate-candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-secret": secret },
        body: JSON.stringify({ topic: topic.trim(), count }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "오류 발생"); return; }
      setResult(json);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: "0 20px", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 6px" }}>🔮 GYEOL 후보 자동 생성</h1>
        <p style={{ color: "#64748b", fontSize: 14, margin: 0 }}>
          어떤 토픽이든 입력하세요. 스포츠 스코어, 연예인 정보, TV 종류, 디지털 제품, 부동산, 복지 — 제한 없음.
          Perplexity가 웹을 검색해 검증 후보를 생성합니다.
        </p>
      </div>

      <div style={{ marginBottom: 20 }}>
        <label style={{ display: "block", fontWeight: 700, marginBottom: 8, fontSize: 14 }}>
          토픽 (자유 입력 — 무엇이든)
        </label>
        <input
          type="text"
          value={topic}
          onChange={e => setTopic(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !loading && generate()}
          placeholder="예: 손흥민 커리어 골, 갤럭시 S25 가격, 쿠팡 반품 기간..."
          style={{
            width: "100%", padding: "13px 16px", fontSize: 16,
            border: "2px solid #e2e8f0", borderRadius: 10,
            outline: "none", boxSizing: "border-box",
            transition: "border-color 0.2s",
          }}
          onFocus={e => (e.target.style.borderColor = "#6366f1")}
          onBlur={e => (e.target.style.borderColor = "#e2e8f0")}
        />

        <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 5 }}>
          {TOPIC_SUGGESTIONS.map(s => (
            <button
              key={s}
              onClick={() => setTopic(s)}
              style={{
                padding: "4px 10px", fontSize: 11, borderRadius: 20,
                border: "1px solid #cbd5e1",
                background: topic === s ? "#6366f1" : "#f8fafc",
                color: topic === s ? "#fff" : "#475569",
                cursor: "pointer", transition: "all 0.15s",
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <label style={{ display: "block", fontWeight: 700, marginBottom: 8, fontSize: 14 }}>
          생성 개수: <span style={{ color: "#6366f1", fontWeight: 800 }}>{count}개</span>
        </label>
        <input type="range" min={5} max={50} step={5} value={count}
          onChange={e => setCount(parseInt(e.target.value))}
          style={{ width: "100%", accentColor: "#6366f1" }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
          <span>5</span><span>25</span><span>50</span>
        </div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <label style={{ display: "block", fontWeight: 700, marginBottom: 8, fontSize: 14 }}>Admin Secret</label>
        <input
          type="password" value={secret}
          onChange={e => setSecret(e.target.value)}
          placeholder="••••••••"
          style={{
            width: "100%", padding: "10px 14px", fontSize: 14,
            border: "2px solid #e2e8f0", borderRadius: 8, boxSizing: "border-box",
          }}
        />
      </div>

      <button
        onClick={generate}
        disabled={loading || !topic.trim()}
        style={{
          width: "100%", padding: "15px", fontSize: 16, fontWeight: 800,
          background: loading ? "#94a3b8" : (topic.trim() ? "#6366f1" : "#c7d2fe"),
          color: "#fff", border: "none", borderRadius: 12,
          cursor: loading || !topic.trim() ? "default" : "pointer",
          transition: "background 0.2s",
        }}
      >
        {loading ? "⏳ Perplexity 웹 검색 중..." : `✨ "${topic || "토픽"}" 관련 ${count}개 생성`}
      </button>

      {error && (
        <div style={{ marginTop: 20, padding: 16, background: "#fef2f2", borderRadius: 10, color: "#dc2626", fontSize: 14, border: "1px solid #fca5a5" }}>
          ❌ {error}
        </div>
      )}

      {result && (
        <div style={{ marginTop: 24, padding: 20, background: "#f0fdf4", borderRadius: 12, border: "1px solid #86efac" }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: "#15803d", marginBottom: 12 }}>
            ✅ &quot;{result.topic}&quot; — {result.generated}개 생성 / {result.saved}개 저장 / 출처 {result.citations_found}개
          </div>
          <div style={{ fontSize: 13, color: "#166534" }}>
            {result.preview?.map((p, i) => (
              <div key={i} style={{ marginTop: 6, padding: "8px 12px", background: "#dcfce7", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>{p.title}</span>
                <span style={{ fontSize: 11, color: "#4ade80", background: "#166534", padding: "2px 8px", borderRadius: 10 }}>{p.category}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14, display: "flex", gap: 12 }}>
            <a href="/admin/candidates" style={{ color: "#15803d", fontWeight: 700, fontSize: 13, textDecoration: "underline" }}>
              → 검토 큐 보기
            </a>
            <button onClick={() => { setResult(null); setTopic(""); }} style={{ background: "none", border: "none", color: "#4ade80", fontSize: 13, cursor: "pointer", textDecoration: "underline" }}>
              + 다른 토픽 생성
            </button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 40, padding: 16, background: "#f1f5f9", borderRadius: 10, fontSize: 13, color: "#64748b" }}>
        <strong>💡 생성 원칙</strong><br/>
        모든 생성 값은 <code>확인 필요</code>로 고정. 실제 값은 관리자 검토 후 입력.
        AI가 틀리기 쉬운 정보 위주로 선별됩니다.
      </div>
    </div>
  );
    }
