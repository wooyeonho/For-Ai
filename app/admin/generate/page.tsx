"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { AdminSecretField, useAdminSecret } from "../AdminSecretProvider";

const PROVIDER_ICONS: Record<string, string> = {
  perplexity: "🔍",
  gemini: "✦",
  gpt: "◎",
  grok: "⚡",
  nvidia: "▣",
};

const FALLBACK_PROVIDERS = [
  { key: "perplexity", label: "Perplexity (웹 검색)", icon: "🔍" },
  { key: "gemini", label: "Gemini 2.0", icon: "✦" },
  { key: "gpt", label: "OpenAI GPT-4o", icon: "◎" },
  { key: "grok", label: "xAI Grok", icon: "⚡" },
  { key: "nvidia", label: "NVIDIA Llama 3.3 70B", icon: "▣" },
];

const CATEGORY_PRESETS = [
  { label: "교통 요금", example: "서울 지하철 환승 요금과 심야버스 요금" },
  { label: "여권/민원 수수료", example: "여권 재발급 수수료와 온라인 민원 발급 수수료" },
  { label: "전입신고/과태료", example: "전입신고 기한과 지연 과태료" },
  { label: "공항 주차 요금", example: "인천공항 장기주차 요금과 할인 조건" },
  { label: "택배 추가 요금", example: "도서산간 택배 추가 요금과 대형 화물 할증" },
  { label: "은행 수수료", example: "타행 ATM 출금 수수료와 해외송금 수수료" },
  { label: "통신사 요금제 조건", example: "5G 요금제 선택약정 할인 조건과 위약금" },
  { label: "환불 규정", example: "온라인 공연 예매 취소 수수료와 환불 기한" },
  { label: "공공기관 신청 기한", example: "근로장려금 신청 기한과 추가 신청 기간" },
];

const LANGUAGES = [
  { code: "ko", label: "한국어", flag: "🇰🇷" },
  { code: "en", label: "English", flag: "🇺🇸" },
  { code: "hi", label: "हिन्दी", flag: "🇮🇳" },
  { code: "ar", label: "العربية", flag: "🇸🇦" },
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "ja", label: "日本語", flag: "🇯🇵" },
  { code: "zh", label: "中文", flag: "🇨🇳" },
];

interface ConsensusInfo {
  consensus_score?: number;
  consensus_level?: "unanimous" | "majority" | "minority" | "single";
  agreed_providers?: string[];
}

interface ProviderOption {
  key: string;
  label: string;
  model?: string;
  supports_web_search?: boolean;
}

interface GenerateResult {
  topic: string;
  lang: string;
  providers_used: string[];
  total_generated: number;
  saved: number;
  preview: (Record<string, unknown> & ConsensusInfo)[];
  provider_results?: Record<string, { generated: number; error?: string; parse_error?: string }>;
  skipped_duplicates?: number;
  consensus_summary?: {
    total_unique: number;
    unanimous: number;
    majority: number;
    minority: number;
    single: number;
  };
  error?: string;
  save_status?: "saved" | "failed" | "skipped" | "skipped_all_duplicates";
  save_error?: string;
  save_error_details?: Record<string, unknown>;
}

export default function AdminGeneratePage() {
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState(10);
  const [lang, setLang] = useState("ko");
  const [availableProviders, setAvailableProviders] = useState<ProviderOption[]>([]);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [providersError, setProvidersError] = useState("");
  const [selectedProviders, setSelectedProviders] = useState<string[]>(["perplexity"]);
  const [crossVerify, setCrossVerify] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState("");
  const { adminSecret, setAdminSecret, resetAdminSecret } = useAdminSecret();

  useEffect(() => {
    async function loadProviders() {
      try {
        if (!adminSecret) { setProvidersLoading(false); return; }
        const res = await fetch("/api/admin/generate-candidates", { headers: { "x-admin-secret": adminSecret } });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        const providers = (data.available_providers ?? []) as ProviderOption[];
        setAvailableProviders(providers);
        if (providers.length > 0) setSelectedProviders([providers[0].key]);
      } catch (e) {
        setProvidersError(String(e));
      } finally {
        setProvidersLoading(false);
      }
    }

    loadProviders();
  }, [adminSecret]);

  function toggleProvider(key: string) {
    setSelectedProviders((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]
    );
  }

  async function handleGenerate() {
    if (!topic.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/admin/generate-candidates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": adminSecret,
          "x-admin-csrf": "1",
        },
        body: JSON.stringify({
          topic: topic.trim(),
          count,
          lang,
          providers: selectedProviders,
          cross_verify: crossVerify,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data.error || `HTTP ${res.status}`;
        setError(msg);
        if (res.status === 401) {
          setAdminSecret("");
        }
      } else {
        setResult(data);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "40px 20px" }}>
      <nav style={{ marginBottom: 24, fontSize: 13 }}>
        <Link href="/admin/review" style={{ color: "#6b7280" }}>← Admin</Link>
      </nav>

      <h1 style={{ fontSize: 24, marginBottom: 8 }}>AI Candidate Generator</h1>
      <p style={{ color: "#6b7280", marginBottom: 32 }}>
        멀티 AI로 토픽 후보를 자동 생성합니다. 생성된 후보는 topic_candidates 테이블에 저장됩니다.
      </p>

      <div style={{ display: "grid", gap: 20 }}>
        {/* Admin secret */}
        <div style={{ padding: 12, background: adminSecret ? "#f0fdf4" : "#fef3c7", borderRadius: 8, border: `1px solid ${adminSecret ? "#86efac" : "#f59e0b"}` }}>
          <AdminSecretField
            adminSecret={adminSecret}
            setAdminSecret={setAdminSecret}
            resetAdminSecret={resetAdminSecret}
            label={`관리자 인증키 ${adminSecret ? "✓" : ""}`}
            placeholder="ADMIN_SECRET 입력"
            inputStyle={{ flex: 1, padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14 }}
          />
        </div>

        {/* Topic input */}
        <div>
          <label style={{ fontWeight: 600, fontSize: 14, display: "block", marginBottom: 6 }}>
            추천 카테고리 프리셋
          </label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {CATEGORY_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => setTopic(preset.example)}
                title={preset.example}
                style={{
                  padding: "7px 10px",
                  border: topic === preset.example ? "2px solid #2563eb" : "1px solid #e5e7eb",
                  borderRadius: 999,
                  background: topic === preset.example ? "#eff6ff" : "#fff",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <p style={{ margin: "0 0 12px", fontSize: 12, color: "#6b7280" }}>
            공식 출처가 존재하는 주제를 우선 추천합니다. 프리셋을 누르면 topic 입력창에 예시가 자동 입력됩니다.
          </p>
          <label style={{ fontWeight: 600, fontSize: 14, display: "block", marginBottom: 6 }}>
            토픽 / 주제
          </label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="예: 서울 지하철, Indian railways, 日本の電車料金..."
            style={{ width: "100%", padding: "10px 14px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 15 }}
          />
        </div>

        {/* Language selection */}
        <div>
          <label style={{ fontWeight: 600, fontSize: 14, display: "block", marginBottom: 6 }}>
            언어 (Language)
          </label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                onClick={() => setLang(l.code)}
                style={{
                  padding: "6px 12px",
                  border: lang === l.code ? "2px solid #2563eb" : "1px solid #e5e7eb",
                  borderRadius: 6,
                  background: lang === l.code ? "#eff6ff" : "#fff",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                {l.flag} {l.label}
              </button>
            ))}
          </div>
        </div>

        {/* AI Providers */}
        <div>
          <label style={{ fontWeight: 600, fontSize: 14, display: "block", marginBottom: 6 }}>
            AI 모델 선택
          </label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(availableProviders.length > 0 ? availableProviders : FALLBACK_PROVIDERS).map((p) => (
              <button
                key={p.key}
                onClick={() => availableProviders.length > 0 && toggleProvider(p.key)}
                disabled={availableProviders.length === 0}
                style={{
                  padding: "8px 14px",
                  border: selectedProviders.includes(p.key) ? "2px solid #2563eb" : "1px solid #e5e7eb",
                  borderRadius: 8,
                  background: selectedProviders.includes(p.key) ? "#eff6ff" : "#fff",
                  cursor: availableProviders.length === 0 ? "not-allowed" : "pointer",
                  opacity: availableProviders.length === 0 ? 0.55 : 1,
                  fontSize: 14,
                }}
              >
                {PROVIDER_ICONS[p.key] ?? "•"} {p.label}
              </button>
            ))}
          </div>
          {providersLoading && <p style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>사용 가능한 provider 확인 중...</p>}
          {!providersLoading && availableProviders.length === 0 && (
            <p style={{ marginTop: 8, fontSize: 12, color: "#b45309" }}>
              사용 가능한 provider가 없습니다. 배포 환경변수에 PERPLEXITY_API_KEY, GOOGLE_GEMINI_API_KEY, OPENAI_API_KEY, XAI_API_KEY, NVIDIA_API_KEY 중 최소 1개를 설정해야 합니다.
              {providersError && ` (${providersError})`}
            </p>
          )}
        </div>

        {/* Options row */}
        <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
          <div>
            <label style={{ fontWeight: 600, fontSize: 14, display: "block", marginBottom: 6 }}>
              생성 개수
            </label>
            <input
              type="number"
              value={count}
              onChange={(e) => setCount(Math.min(50, Math.max(1, parseInt(e.target.value) || 1)))}
              min={1} max={50}
              style={{ width: 80, padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14 }}
            />
          </div>
          <div style={{ marginTop: 20 }}>
            <label style={{ fontSize: 14, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={crossVerify}
                onChange={(e) => setCrossVerify(e.target.checked)}
                style={{ marginRight: 6 }}
              />
              교차검증 (선택된 AI 전부 동시 호출)
            </label>
          </div>
        </div>

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={loading || !topic.trim() || selectedProviders.length === 0 || availableProviders.length === 0}
          style={{
            padding: "12px 24px",
            background: loading ? "#9ca3af" : "#2563eb",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontSize: 16,
            fontWeight: 600,
            cursor: loading || !topic.trim() || selectedProviders.length === 0 || availableProviders.length === 0 ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "생성 중..." : `후보 ${count}개 생성`}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ marginTop: 24, padding: 16, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8 }}>
          <p style={{ color: "#dc2626", fontWeight: 600 }}>Error: {error}</p>
        </div>
      )}

      {/* Results */}
      {result && (
        <div style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 18, marginBottom: 12 }}>생성 결과</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12, marginBottom: 20 }}>
            <div style={{ padding: 12, background: "#f0fdf4", borderRadius: 8, textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{result.total_generated}</div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>생성됨</div>
            </div>
            <div style={{ padding: 12, background: "#eff6ff", borderRadius: 8, textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{result.saved}</div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>DB 저장</div>
            </div>
            <div style={{ padding: 12, background: "#faf5ff", borderRadius: 8, textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{result.providers_used?.length ?? 0}</div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>AI 사용</div>
            </div>
          </div>

          {result.save_error && (
            <div style={{ padding: 12, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, marginBottom: 16, fontSize: 13, color: "#b91c1c" }}>
              <strong>DB 저장 실패:</strong> {result.save_error}
              {result.save_error_details && (
                <pre style={{ whiteSpace: "pre-wrap", marginTop: 8, fontSize: 12 }}>
                  {JSON.stringify(result.save_error_details, null, 2)}
                </pre>
              )}
            </div>
          )}

          {result.provider_results && (
            <div style={{ marginBottom: 20, fontSize: 13 }}>
              {Object.entries(result.provider_results).map(([provider, r]) => (
                <div key={provider} style={{ padding: "4px 0" }}>
                  <strong>{provider}</strong>: {r.generated}개 생성
                  {r.error && <span style={{ color: "#dc2626" }}> — {r.error}</span>}
                  {r.parse_error && <span style={{ color: "#b45309" }}> — 파싱 실패: {r.parse_error}</span>}
                </div>
              ))}
            </div>
          )}

          {result.consensus_summary && (
            <div style={{ marginBottom: 20, padding: 16, background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 8 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>교차검증 합의 결과</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 8, fontSize: 13 }}>
                <div style={{ textAlign: "center", padding: 8, background: "#dcfce7", borderRadius: 6 }}>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{result.consensus_summary.unanimous}</div>
                  <div style={{ color: "#15803d" }}>만장일치</div>
                </div>
                <div style={{ textAlign: "center", padding: 8, background: "#dbeafe", borderRadius: 6 }}>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{result.consensus_summary.majority}</div>
                  <div style={{ color: "#1d4ed8" }}>다수 동의</div>
                </div>
                <div style={{ textAlign: "center", padding: 8, background: "#fef9c3", borderRadius: 6 }}>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{result.consensus_summary.minority}</div>
                  <div style={{ color: "#a16207" }}>소수 동의</div>
                </div>
                <div style={{ textAlign: "center", padding: 8, background: "#f3f4f6", borderRadius: 6 }}>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{result.consensus_summary.single}</div>
                  <div style={{ color: "#6b7280" }}>단독 생성</div>
                </div>
              </div>
              <p style={{ fontSize: 12, color: "#6b7280", marginTop: 8 }}>
                중복 제거 후 고유 토픽: {result.consensus_summary.total_unique}개
              </p>
            </div>
          )}

          {result.preview && result.preview.length > 0 && (
            <div>
              <h3 style={{ fontSize: 14, marginBottom: 8 }}>미리보기 (상위 {result.preview.length}개)</h3>
              {result.preview.map((c, i) => {
                const levelColors: Record<string, string> = {
                  unanimous: "#16a34a", majority: "#2563eb", minority: "#ca8a04", single: "#9ca3af",
                };
                const levelLabels: Record<string, string> = {
                  unanimous: "만장일치", majority: "다수 동의", minority: "소수", single: "단독",
                };
                const sourceHints = Array.isArray(c.source_hints) ? c.source_hints : [];
                const hasSourceHints = sourceHints.length > 0;
                return (
                  <div key={i} style={{ padding: 12, border: hasSourceHints ? "1px solid #e5e7eb" : "1px solid #f59e0b", borderRadius: 8, marginBottom: 8, background: hasSourceHints ? "#fff" : "#fffbeb" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <p style={{ fontWeight: 600 }}>{String(c.title)}</p>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {!hasSourceHints && (
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 12, color: "#92400e", background: "#fef3c7" }}>
                          ⚠ source_hints 없음
                        </span>
                      )}
                      {c.consensus_level && (
                        <span style={{
                          fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 12,
                          color: levelColors[c.consensus_level] ?? "#9ca3af",
                          background: `${levelColors[c.consensus_level] ?? "#9ca3af"}18`,
                        }}>
                          {levelLabels[c.consensus_level] ?? c.consensus_level}
                          {c.consensus_score !== undefined && ` ${Math.round(c.consensus_score * 100)}%`}
                        </span>
                      )}
                      </div>
                    </div>
                    <p style={{ fontSize: 12, color: "#6b7280" }}>
                      {String(c.slug)} · {String(c.category)} · {String(c.generation_model)} · source hints {sourceHints.length}개
                      {c.agreed_providers && ` · ${(c.agreed_providers as string[]).join(", ")}`}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {(!result.preview || result.preview.length === 0) && (
            <div style={{ padding: 20, background: "#f9fafb", border: "1px dashed #d1d5db", borderRadius: 8, textAlign: "center", color: "#6b7280" }}>
              <p style={{ fontWeight: 600, marginBottom: 4 }}>표시할 후보가 없습니다</p>
              <p style={{ fontSize: 13, margin: 0 }}>
                {result.save_status === "skipped_all_duplicates"
                  ? `생성된 ${result.total_generated}개가 모두 이미 등록된 후보(중복)라 저장되지 않았습니다.`
                  : result.total_generated === 0
                    ? "AI가 이 토픽으로 후보를 생성하지 못했습니다. 더 구체적인 토픽으로 다시 시도해 보세요."
                    : "생성은 되었으나 미리보기가 비어 있습니다. provider 결과를 확인하세요."}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
