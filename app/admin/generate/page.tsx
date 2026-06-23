"use client";
import { useState, useEffect } from "react";
import Link from "next/link";

const PROVIDERS = [
  { key: "perplexity", label: "Perplexity (웹 검색)", icon: "🔍" },
  { key: "gemini", label: "Gemini 2.0", icon: "✦" },
  { key: "gpt", label: "GPT-4o", icon: "◎" },
  { key: "grok", label: "Grok", icon: "⚡" },
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

interface GenerateResult {
  topic: string;
  lang: string;
  providers_used: string[];
  total_generated: number;
  saved: number;
  preview: Record<string, unknown>[];
  provider_results?: Record<string, { generated: number; error?: string }>;
  error?: string;
  save_error?: string;
}

export default function AdminGeneratePage() {
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState(10);
  const [lang, setLang] = useState("ko");
  const [selectedProviders, setSelectedProviders] = useState<string[]>(["perplexity"]);
  const [crossVerify, setCrossVerify] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState("");
  const [adminSecret, setAdminSecret] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("gyeol_admin_secret");
    if (saved) setAdminSecret(saved);
  }, []);

  function saveAdminSecret(value: string) {
    setAdminSecret(value);
    localStorage.setItem("gyeol_admin_secret", value);
  }

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
          localStorage.removeItem("gyeol_admin_secret");
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
    <main style={{ maxWidth: 800, margin: "0 auto", padding: "40px 20px" }}>
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
          <label style={{ fontWeight: 600, fontSize: 14, display: "block", marginBottom: 6 }}>
            관리자 인증키 {adminSecret && "✓"}
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="password"
              value={adminSecret}
              onChange={(e) => setAdminSecret(e.target.value)}
              onBlur={(e) => { if (e.target.value) saveAdminSecret(e.target.value); }}
              placeholder="ADMIN_SECRET 입력"
              style={{ flex: 1, padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14 }}
            />
            {adminSecret && (
              <button
                onClick={() => { setAdminSecret(""); localStorage.removeItem("gyeol_admin_secret"); }}
                style={{ padding: "8px 12px", border: "1px solid #fca5a5", borderRadius: 6, background: "#fff", color: "#dc2626", fontSize: 12, cursor: "pointer" }}
              >
                초기화
              </button>
            )}
          </div>
        </div>

        {/* Topic input */}
        <div>
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
            {PROVIDERS.map((p) => (
              <button
                key={p.key}
                onClick={() => toggleProvider(p.key)}
                style={{
                  padding: "8px 14px",
                  border: selectedProviders.includes(p.key) ? "2px solid #2563eb" : "1px solid #e5e7eb",
                  borderRadius: 8,
                  background: selectedProviders.includes(p.key) ? "#eff6ff" : "#fff",
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                {p.icon} {p.label}
              </button>
            ))}
          </div>
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
          disabled={loading || !topic.trim() || selectedProviders.length === 0}
          style={{
            padding: "12px 24px",
            background: loading ? "#9ca3af" : "#2563eb",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontSize: 16,
            fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
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
              DB 저장 실패: {result.save_error}
            </div>
          )}

          {result.provider_results && (
            <div style={{ marginBottom: 20, fontSize: 13 }}>
              {Object.entries(result.provider_results).map(([provider, r]) => (
                <div key={provider} style={{ padding: "4px 0" }}>
                  <strong>{provider}</strong>: {r.generated}개 생성
                  {r.error && <span style={{ color: "#dc2626" }}> — {r.error}</span>}
                </div>
              ))}
            </div>
          )}

          {result.preview && result.preview.length > 0 && (
            <div>
              <h3 style={{ fontSize: 14, marginBottom: 8 }}>미리보기 (상위 3개)</h3>
              {result.preview.map((c, i) => (
                <div key={i} style={{ padding: 12, border: "1px solid #e5e7eb", borderRadius: 8, marginBottom: 8 }}>
                  <p style={{ fontWeight: 600 }}>{String(c.title)}</p>
                  <p style={{ fontSize: 12, color: "#6b7280" }}>
                    {String(c.slug)} · {String(c.category)} · {String(c.generation_model)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
