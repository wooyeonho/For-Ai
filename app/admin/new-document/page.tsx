"use client";
import { useState } from "react";
import { AdminSecretField, useAdminSecret } from "../AdminSecretProvider";

const CLAIM_PLACEHOLDER = `parking.availability::주차 가능 여부는?
parking.free_minutes::무료 주차 시간은?
parking.max_vehicles::최대 주차 대수는?`;

export default function NewDocumentPage() {
  const { adminSecret, setAdminSecret, resetAdminSecret } = useAdminSecret();
  const [entityId, setEntityId] = useState("");
  const [slug, setSlug] = useState("");
  const [lang, setLang] = useState("ko");
  const [country, setCountry] = useState("KR");
  const [jurisdiction, setJurisdiction] = useState("KR");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [template, setTemplate] = useState("fact-sheet");
  const [claimsText, setClaimsText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    document_id?: string;
    slug?: string;
    claims_created?: number;
    url?: string;
    error?: string;
  } | null>(null);

  function parseClaims(raw: string) {
    return raw
      .split("\n")
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        const sep = line.indexOf("::");
        if (sep === -1) return { field_path: line, claim_text: line };
        return {
          field_path: line.slice(0, sep).trim(),
          claim_text: line.slice(sep + 2).trim() || line.slice(0, sep).trim(),
        };
      })
      .filter(c => c.field_path);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/new-document", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": adminSecret,
          "x-admin-csrf": "1",
        },
        body: JSON.stringify({
          entity_id: entityId.trim(),
          slug: slug.trim(),
          lang: lang.trim() || "ko",
          country: country.trim().toUpperCase(),
          jurisdiction: jurisdiction.trim().toUpperCase() || country.trim().toUpperCase(),
          title: title.trim(),
          category: category.trim(),
          template: template.trim() || "fact-sheet",
          claims: parseClaims(claimsText),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setResult({
          success: true,
          document_id: data.document_id,
          slug: data.slug,
          claims_created: data.claims_created,
          url: data.url,
        });
        setSlug(""); setTitle(""); setCategory(""); setClaimsText("");
      } else {
        setResult({ success: false, error: data.error ?? String(res.status) });
      }
    } catch {
      setResult({ success: false, error: "네트워크 오류. 잠시 후 다시 시도해 주세요." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <article>
      <header className="registry-panel">
        <p className="eyebrow">For-Ai · Admin</p>
        <h1>새 Document 생성</h1>
        <p>
          Supabase <code>documents</code> + <code>claims</code> + <code>listings</code> 테이블에 직접 저장합니다.
          모든 claim은 <strong>확인 필요 / low / needs_review</strong> 상태로 시작합니다.
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
              <h2>생성 완료</h2>
              <p>Document ID: <code>{result.document_id}</code></p>
              <p>Claim 생성: {result.claims_created}개</p>
              {result.url && (
                <p style={{ marginTop: 8 }}>
                  <a href={result.url} style={{ color: "#2563eb" }}>위키 페이지 보기 → {result.url}</a>
                </p>
              )}
            </>
          ) : (
            <>
              <h2>오류</h2>
              <p>{result.error}</p>
            </>
          )}
        </section>
      )}

      <section className="registry-panel" aria-labelledby="document-form-title">
        <h2 id="document-form-title">Document 필드</h2>
        <form onSubmit={handleSubmit} className="registry-form">
          <label>Entity ID <span aria-label="필수">*</span>
            <input
              type="text" value={entityId} onChange={e => setEntityId(e.target.value)} required
              placeholder="kr-person-athlete-ryu-hyun-jin-001"
            />
          </label>
          <label>Slug (URL) <span aria-label="필수">*</span>
            <input
              type="text" value={slug} onChange={e => setSlug(e.target.value)} required
              placeholder="ryu-hyun-jin-stats"
            />
          </label>
          <label>Language
            <input
              type="text" value={lang} onChange={e => setLang(e.target.value)} required
              placeholder="ko"
            />
          </label>
          <label>Country <span aria-label="필수">*</span>
            <input
              type="text" value={country} onChange={e => { setCountry(e.target.value); if (!jurisdiction) setJurisdiction(e.target.value); }} required
              placeholder="KR"
            />
          </label>
          <label>Jurisdiction (claim 관할)
            <input
              type="text" value={jurisdiction} onChange={e => setJurisdiction(e.target.value)}
              placeholder="KR, US-CA, EU"
            />
          </label>
          <label>Title <span aria-label="필수">*</span>
            <input
              type="text" value={title} onChange={e => setTitle(e.target.value)} required
              placeholder="류현진 기본 정보"
            />
          </label>
          <label>Category <span aria-label="필수">*</span>
            <input
              type="text" value={category} onChange={e => setCategory(e.target.value)} required
              placeholder="person_athlete"
            />
          </label>
          <label>Template
            <input
              type="text" value={template} onChange={e => setTemplate(e.target.value)} required
              placeholder="fact-sheet"
            />
          </label>
          <label>
            Claims (줄당 1개, 형식: <code>field_path::질문 텍스트</code>)
            <textarea
              value={claimsText} onChange={e => setClaimsText(e.target.value)}
              placeholder={CLAIM_PLACEHOLDER}
              rows={6}
            />
          </label>
          <AdminSecretField
            adminSecret={adminSecret}
            setAdminSecret={setAdminSecret}
            resetAdminSecret={resetAdminSecret}
            label="Admin Secret *"
            placeholder="관리자 비밀키"
          />
          <button type="submit" disabled={loading}>{loading ? "생성 중..." : "Document 생성"}</button>
        </form>
      </section>

      <section className="registry-panel" aria-labelledby="claims-format-guide">
        <h2 id="claims-format-guide">Claims 형식 안내</h2>
        <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.7 }}>
          각 줄은 하나의 claim입니다. <code>field_path::질문 텍스트</code> 형식으로 입력하세요.<br />
          <code>::</code>를 생략하면 field_path가 질문 텍스트로 사용됩니다.<br />
          모든 claim value는 자동으로 <strong>확인 필요</strong>로 설정됩니다.
        </p>
      </section>
    </article>
  );
}
