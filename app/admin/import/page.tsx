"use client";
import Link from "next/link";
import { useState } from "react";
import { AdminSecretField, useAdminSecret } from "../AdminSecretProvider";

const JSONL_PLACEHOLDER = `{"entity_id":"kr-person-athlete-son-001","type":"person_athlete","name":"손흥민 현재 소속팀","title":"손흥민 현재 소속팀","slug":"son-heung-min-current-team","category":"person_athlete","lang":"ko","country":"KR","jurisdiction":"KR","claims":[{"field_path":"athlete.current_team","claim_text":"현재 소속팀은 확인이 필요합니다.","claim_value":"확인 필요","confidence":"low","status":"needs_review","sources":[]}]}
{"entity_id":"global-food-allergen-001","type":"product_food","name":"민트초코 알레르기 성분","title":"민트초코 알레르기 성분","slug":"mint-choco-allergens","category":"product_food","lang":"ko","country":"global","jurisdiction":"global","claims":[{"field_path":"food.allergens","claim_text":"알레르기 유발 성분은 확인이 필요합니다.","claim_value":"확인 필요","confidence":"low","status":"needs_review","sources":[]}]}`;

interface ImportResult {
  success: boolean;
  imported?: number;
  claims_created?: number;
  error?: string;
  validation?: { line: number; missing: string[]; claims: number }[];
}

export default function AdminImportPage() {
  const { adminSecret, setAdminSecret, resetAdminSecret, login, status, message: loginMessage } = useAdminSecret();
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
      const res = await fetch("/api/admin/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-csrf": "1",
        },
        body: JSON.stringify({ rows }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setResult({ success: true, imported: data.imported, claims_created: data.claims_created, validation: data.validation });
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
        <p className="eyebrow">For-Ai · Admin</p>
        <h1>Canonical JSONL 일괄 가져오기</h1>
        <p>
          JSONL(줄당 JSON 1개)을 검증한 뒤 <code>entities → documents → claims</code>에 저장합니다.
          모든 claim은 <strong>확인 필요 / low / needs_review</strong>로 시작하며, country/jurisdiction 값을 유지합니다.
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
              <p>{result.imported}개 문서와 {result.claims_created}개 placeholder claim이 생성되었습니다.</p>
              <p style={{ marginTop: 8 }}>
                <Link href="/admin/verify-claim" style={{ color: "#2563eb" }}>claim 검증하러 가기 →</Link>
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
          <AdminSecretField
            adminSecret={adminSecret}
            setAdminSecret={setAdminSecret}
            resetAdminSecret={resetAdminSecret}
            login={login}
            status={status}
            message={loginMessage}
            label="Admin Secret *"
            placeholder="관리자 비밀키"
          />
          <button type="submit" disabled={loading || lineCount === 0}>
            {loading ? "등록 중..." : `${lineCount}개 후보 등록`}
          </button>
        </form>
      </section>

      <section className="registry-panel" aria-labelledby="jsonl-format-guide">
        <h2 id="jsonl-format-guide">JSONL 형식</h2>
        <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.7 }}>필수 필드: <code>entity_id</code>, <code>type</code>, <code>title</code>, <code>slug</code>, <code>category</code>, <code>country</code></p>
        <pre style={{ fontSize: 12, background: "#f9fafb", padding: "10px 12px", borderRadius: 6, overflow: "auto" }}>{`{
  "entity_id": "kr-topic-example-001",
  "type": "administration.documents",
  "name": "엔티티 이름",
  "title": "문서 제목",
  "slug": "url-friendly-slug",
  "category": "administration.documents",
  "country": "KR",
  "jurisdiction": "KR",
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
