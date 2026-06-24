"use client";
import Link from "next/link";
import { useState } from "react";

const JSONL_PLACEHOLDER = `{"title":"손흥민 현재 소속팀","slug":"son-heung-min-current-team","category":"person_athlete","lang":"ko","why_people_ask_ai":"이적 루머가 많아 AI에게 자주 물어봄","claims":[{"question":"현재 소속팀은?","placeholder_value":"확인 필요"}]}
{"title":"배스킨라빈스 민트초코 알레르기 성분","slug":"baskinrobbins-mint-choco-allergens","category":"product_food","lang":"ko","claims":[{"question":"알레르기 유발 성분은?","placeholder_value":"확인 필요"}]}`;

interface ImportResult {
  success: boolean;
  imported?: number;
  error?: string;
  candidates?: { id: string; slug: string }[];
}

export default function AdminImportPage() {
  const [adminSecret, setAdminSecret] = useState("");
  const [jsonlText, setJsonlText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [parseError, setParseError] = useState("");

  function parseJsonl(raw: string): { rows: Record<string, unknown>[]; error: string } {
    const lines = raw.split("\n").map(l => l.trim()).filter(Boolean);
    const rows: Record<string, unknown>[] = [];
    for (let i = 0; i < lines.length; i++) {
      try {
        rows.push(JSON.parse(lines[i]));
      } catch {
        return { rows: [], error: `줄 ${i + 1} JSON 파싱 오류: ${lines[i].slice(0, 60)}` };
      }
    }
    return { rows, error: "" };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setParseError("");
    setResult(null);

    const { rows, error } = parseJsonl(jsonlText);
    if (error) { setParseError(error); return; }
    if (rows.length === 0) { setParseError("JSONL이 비어 있습니다."); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/admin/candidates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": adminSecret,
          "x-admin-csrf": "1",
        },
        body: JSON.stringify({ candidates: rows }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setResult({ success: true, imported: data.imported, candidates: data.candidates });
        setJsonlText("");
      } else {
        setResult({ success: false, error: data.error ?? String(res.status) });
      }
    } catch {
      setResult({ success: false, error: "네트워크 오류. 잠시 후 다시 시도해 주세요." });
    } finally {
      setLoading(false);
    }
  }

  const lineCount = jsonlText.split("\n").filter(l => l.trim()).length;

  return (
    <article>
      <header className="registry-panel">
        <p className="eyebrow">GYEOL · Admin</p>
        <h1>Topic Candidates 일괄 가져오기</h1>
        <p>
          JSONL(줄당 JSON 1개)을 붙여넣으면 <code>topic_candidates</code> 테이블에 <strong>status: new</strong>로 저장됩니다.
          저장 후 <Link href="/admin/candidates" style={{ color: "#2563eb" }}>후보 검토 페이지</Link>에서 승인/거절할 수 있습니다.
        </p>
      </header>

      {result && (
        <section
          className="registry-panel"
          style={{
            background: result.success ? "#f0fdf4" : "#fef2f2",
            borderLeft: `3px solid ${result.success ? "#16a34a" : "#dc2626"}`,
          }}
          aria-live="polite"
        >
          {result.success ? (
            <>
              <h2>가져오기 완료</h2>
              <p>{result.imported}개 후보가 검토 대기열에 등록되었습니다.</p>
              {result.candidates && result.candidates.length > 0 && (
                <ul style={{ fontSize: 13, marginTop: 8, color: "#374151" }}>
                  {result.candidates.map(c => (
                    <li key={c.id}><code>{c.slug}</code></li>
                  ))}
                </ul>
              )}
              <p style={{ marginTop: 8 }}>
                <Link href="/admin/candidates" style={{ color: "#2563eb" }}>후보 검토하러 가기 →</Link>
              </p>
            </>
          ) : (
            <>
              <h2>오류</h2>
              <p>{result.error}</p>
            </>
          )}
        </section>
      )}

      <section className="registry-panel" aria-labelledby="import-form-title">
        <h2 id="import-form-title">JSONL 입력 {lineCount > 0 && <span style={{ fontWeight: 400, fontSize: 14 }}>({lineCount}개)</span>}</h2>
        <form onSubmit={handleSubmit} className="registry-form">
          <label>
            JSONL (줄당 JSON 1개) <span aria-label="필수">*</span>
            <textarea
              value={jsonlText} onChange={e => setJsonlText(e.target.value)} required
              placeholder={JSONL_PLACEHOLDER}
              rows={8}
              style={{ fontFamily: "monospace", fontSize: 12 }}
            />
          </label>
          {parseError && (
            <div style={{ padding: "8px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, fontSize: 13, color: "#b91c1c" }}>
              {parseError}
            </div>
          )}
          <label>Admin Secret <span aria-label="필수">*</span>
            <input
              type="password" value={adminSecret} onChange={e => setAdminSecret(e.target.value)} required
              placeholder="관리자 비밀키"
            />
          </label>
          <button type="submit" disabled={loading || lineCount === 0}>
            {loading ? "등록 중..." : `${lineCount}개 후보 등록`}
          </button>
        </form>
      </section>

      <section className="registry-panel" aria-labelledby="jsonl-format-guide">
        <h2 id="jsonl-format-guide">JSONL 형식</h2>
        <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.7 }}>필수 필드: <code>title</code>, <code>slug</code>, <code>category</code></p>
        <pre style={{ fontSize: 12, background: "#f9fafb", padding: "10px 12px", borderRadius: 6, overflow: "auto" }}>{`{
  "title": "문서 제목",
  "slug": "url-friendly-slug",
  "category": "person_athlete",
  "lang": "ko",
  "why_people_ask_ai": "AI에게 자주 물어보는 이유",
  "why_ai_gets_wrong": "AI가 틀리는 이유",
  "claims": [
    { "question": "현재 소속팀은?", "placeholder_value": "확인 필요" }
  ],
  "source_hints": ["https://official-source.example.com"]
}`}</pre>
      </section>
    </article>
  );
}
