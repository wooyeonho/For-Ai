"use client";
import { useState } from "react";
import { TAXONOMY, TAXONOMY_KEYS } from "../../../lib/topic-candidates";

type GenerateResult = {
  generated: number;
  saved: number;
  preview: Array<{
    title: string;
    slug: string;
    why_people_ask_ai: string;
    why_ai_gets_wrong: string;
    claims: Array<{ question: string; field_path: string }>;
    source_hints: Array<{ url: string; title: string }>;
  }>;
  error?: string;
};

export default function GeneratePage() {
  const [category, setCategory] = useState("metro");
  const [count, setCount] = useState(10);
  const [adminSecret, setAdminSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [history, setHistory] = useState<Array<{ category: string; count: number; generated: number; ts: string }>>([]);

  const taxEntry = TAXONOMY[category];

  async function generate() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/generate-candidates", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(adminSecret ? { "x-admin-secret": adminSecret } : {}),
        },
        body: JSON.stringify({ category, count, save: true }),
      });
      const json: GenerateResult = await res.json();
      setResult(json);
      if (!json.error) {
        setHistory(h => [{ category, count, generated: json.generated, ts: new Date().toLocaleTimeString() }, ...h.slice(0, 19)]);
      }
    } catch (e) {
      setResult({ generated: 0, saved: 0, preview: [], error: String(e) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 900, margin: "0 auto", padding: "2rem 1rem" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: 4 }}>
        🏭 Topic Candidate 자동 생성
      </h1>
      <p style={{ color: "#666", marginBottom: 24, fontSize: 14 }}>
        카테고리를 선택하고 딸깍 — Claude가 후보를 생성해 DB에 저장합니다.
        모든 claim은 <code>확인 필요 / low / needs_review</code>로 시작합니다.
      </p>

      {/* Controls */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 24 }}>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#555", marginBottom: 4 }}>카테고리</label>
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            style={{ padding: "8px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 14, minWidth: 180 }}
          >
            {TAXONOMY_KEYS.map(k => (
              <option key={k} value={k}>{TAXONOMY[k].label} ({k})</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: "block", fontSize: 12, color: "#555", marginBottom: 4 }}>생성 개수: {count}</label>
          <input
            type="range" min={5} max={50} step={5} value={count}
            onChange={e => setCount(Number(e.target.value))}
            style={{ width: 140 }}
          />
        </div>

        <div>
          <label style={{ display: "block", fontSize: 12, color: "#555", marginBottom: 4 }}>Admin Secret (선택)</label>
          <input
            type="password" value={adminSecret} onChange={e => setAdminSecret(e.target.value)}
            placeholder="env ADMIN_SECRET"
            style={{ padding: "8px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 14, width: 160 }}
          />
        </div>

        <button
          onClick={generate}
          disabled={loading}
          style={{
            padding: "9px 24px", background: loading ? "#999" : "#0066ff",
            color: "#fff", border: "none", borderRadius: 6, fontSize: 15,
            fontWeight: 600, cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "⏳ 생성 중…" : `🚀 ${count}개 생성`}
        </button>
      </div>

      {/* Category info */}
      {taxEntry && (
        <div style={{ background: "#f8f9fa", borderRadius: 8, padding: "12px 16px", marginBottom: 20, fontSize: 13 }}>
          <strong>{taxEntry.label}</strong> · 위험 등급: <span style={{ color: taxEntry.risk_tier === "high" ? "#c00" : taxEntry.risk_tier === "medium" ? "#a60" : "#060" }}>{taxEntry.risk_tier}</span>
          <span style={{ color: "#999", marginLeft: 12 }}>서브카테고리: {taxEntry.subcategories.join(" · ")}</span>
        </div>
      )}

      {/* Result */}
      {result && (
        <div style={{ marginBottom: 32 }}>
          {result.error ? (
            <div style={{ background: "#fff0f0", border: "1px solid #fcc", borderRadius: 8, padding: 16, color: "#c00" }}>
              ❌ {result.error}
            </div>
          ) : (
            <>
              <div style={{ background: "#f0fff4", border: "1px solid #6c6", borderRadius: 8, padding: "10px 16px", marginBottom: 16, fontSize: 14 }}>
                ✅ <strong>{result.generated}개 생성</strong> · <strong>{result.saved}개 DB 저장</strong>
              </div>
              <div style={{ fontSize: 13, color: "#555", marginBottom: 8 }}>미리보기 (최대 3개):</div>
              {result.preview.map((p, i) => (
                <div key={i} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, marginBottom: 12, background: "#fff" }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{p.title}</div>
                  <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>/{p.slug}</div>
                  {p.why_ai_gets_wrong && (
                    <div style={{ fontSize: 12, color: "#c66", marginBottom: 8 }}>
                      ⚠️ AI가 틀리는 이유: {p.why_ai_gets_wrong}
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: "#555" }}>
                    Claims: {p.claims?.map(c => c.question).join(" / ")}
                  </div>
                  {p.source_hints?.length > 0 && (
                    <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
                      출처 힌트: {p.source_hints.map(s => s.title).join(", ")}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div>
          <div style={{ fontSize: 13, color: "#888", marginBottom: 8 }}>이 세션 생성 이력</div>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #eee", textAlign: "left", color: "#888" }}>
                <th style={{ padding: "4px 8px" }}>시각</th>
                <th style={{ padding: "4px 8px" }}>카테고리</th>
                <th style={{ padding: "4px 8px" }}>개수</th>
                <th style={{ padding: "4px 8px" }}>생성됨</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #f5f5f5" }}>
                  <td style={{ padding: "4px 8px", color: "#999" }}>{h.ts}</td>
                  <td style={{ padding: "4px 8px" }}>{TAXONOMY[h.category]?.label ?? h.category}</td>
                  <td style={{ padding: "4px 8px" }}>{h.count}</td>
                  <td style={{ padding: "4px 8px", color: "#060", fontWeight: 600 }}>+{h.generated}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: 40, padding: "12px 16px", background: "#fffbe6", borderRadius: 8, fontSize: 12, color: "#666" }}>
        <strong>⚠️ 주의:</strong> 생성된 모든 candidate은 <code>확인 필요 / needs_review</code> 상태입니다.
        출처 검증 없이 verified로 승격되지 않습니다.
        Admin review: <a href="/admin/review" style={{ color: "#0066ff" }}>/admin/review</a>
      </div>
    </div>
  );
}
