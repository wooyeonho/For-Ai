"use client";
import { useMemo, useState } from "react";
import { AdminSecretField, useAdminSecret } from "../AdminSecretProvider";
import { AdminDbDetails, adminLabel } from "../admin-labels";

type ClaimRow = {
  id: string;
  field_path: string;
  claim_text: string;
  placeholder_value: string;
  jurisdiction: string;
  required_source_type: string;
  source_hint: string;
};

const CLAIM_PLACEHOLDER = `parking.availability::주차 가능 여부는?
parking.free_minutes::무료 주차 시간은?
parking.max_vehicles::최대 주차 대수는?`;

const DEFAULT_CLAIM_ROWS: ClaimRow[] = [
  {
    id: "claim-row-1",
    field_path: "parking.availability",
    claim_text: "주차 가능 여부는?",
    placeholder_value: "확인 필요",
    jurisdiction: "KR",
    required_source_type: "official_page",
    source_hint: "공식 홈페이지의 주차 안내 페이지 URL",
  },
  {
    id: "claim-row-2",
    field_path: "parking.free_minutes",
    claim_text: "무료 주차 시간은?",
    placeholder_value: "확인 필요",
    jurisdiction: "KR",
    required_source_type: "official_page",
    source_hint: "시설 공지, FAQ, 예약 안내의 주차 할인 설명",
  },
];

const SOURCE_TYPE_OPTIONS = [
  "official_page",
  "government_page",
  "policy_document",
  "price_list",
  "press_release",
  "manual_or_spec",
  "direct_contact",
  "other_traceable_source",
];

function makeClaimRow(overrides: Partial<ClaimRow> = {}): ClaimRow {
  return {
    id: `claim-row-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    field_path: "",
    claim_text: "",
    placeholder_value: "확인 필요",
    jurisdiction: "",
    required_source_type: "official_page",
    source_hint: "",
    ...overrides,
  };
}

function parseClaims(raw: string, fallbackJurisdiction: string): ClaimRow[] {
  return raw
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const parts = line.split("::").map(part => part.trim());
      const [fieldPath, claimText, placeholderValue, jurisdiction, requiredSourceType, sourceHint] = parts;
      return makeClaimRow({
        field_path: fieldPath,
        claim_text: claimText || fieldPath,
        placeholder_value: placeholderValue || "확인 필요",
        jurisdiction: jurisdiction || fallbackJurisdiction,
        required_source_type: requiredSourceType || "official_page",
        source_hint: sourceHint || "",
      });
    })
    .filter(c => c.field_path);
}

function serializeClaims(rows: ClaimRow[]) {
  return rows
    .filter(row => row.field_path.trim() || row.claim_text.trim())
    .map(row => [
      row.field_path.trim(),
      row.claim_text.trim() || row.field_path.trim(),
      row.placeholder_value.trim() || "확인 필요",
      row.jurisdiction.trim(),
      row.required_source_type.trim(),
      row.source_hint.trim(),
    ].join("::"))
    .join("\n");
}

export default function NewDocumentPage() {
  const { adminSecret, setAdminSecret, resetAdminSecret, loginAdmin, authMessage } = useAdminSecret();
  const [entityId, setEntityId] = useState("");
  const [slug, setSlug] = useState("");
  const [lang, setLang] = useState("ko");
  const [country, setCountry] = useState("KR");
  const [jurisdiction, setJurisdiction] = useState("KR");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [template, setTemplate] = useState("fact-sheet");
  const [claimsText, setClaimsText] = useState(() => serializeClaims(DEFAULT_CLAIM_ROWS));
  const [claimRows, setClaimRows] = useState<ClaimRow[]>(DEFAULT_CLAIM_ROWS);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    document_id?: string;
    slug?: string;
    claims_created?: number;
    url?: string;
    error?: string;
  } | null>(null);

  const normalizedJurisdiction = (jurisdiction.trim().toUpperCase() || country.trim().toUpperCase());
  const claimsPayload = useMemo(() => claimRows
    .map(row => ({
      field_path: row.field_path.trim(),
      claim_text: row.claim_text.trim() || row.field_path.trim(),
      claim_value: row.placeholder_value.trim() || "확인 필요",
      placeholder_value: row.placeholder_value.trim() || "확인 필요",
      jurisdiction: row.jurisdiction.trim().toUpperCase() || normalizedJurisdiction,
      required_source_type: row.required_source_type.trim() || "official_page",
      source_hint: row.source_hint.trim(),
    }))
    .filter(row => row.field_path), [claimRows, normalizedJurisdiction]);

  function replaceClaimRows(rows: ClaimRow[]) {
    setClaimRows(rows);
    setClaimsText(serializeClaims(rows));
  }

  function updateClaimRow(id: string, patch: Partial<ClaimRow>) {
    const rows = claimRows.map(row => row.id === id ? { ...row, ...patch } : row);
    replaceClaimRows(rows);
  }

  function handleClaimsTextChange(raw: string) {
    setClaimsText(raw);
    setClaimRows(parseClaims(raw, normalizedJurisdiction));
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
          "x-admin-csrf": "1",
        },
        body: JSON.stringify({
          entity_id: entityId.trim(),
          slug: slug.trim(),
          lang: lang.trim() || "ko",
          country: country.trim().toUpperCase(),
          jurisdiction: normalizedJurisdiction,
          title: title.trim(),
          category: category.trim(),
          template: template.trim() || "fact-sheet",
          claims: claimsPayload,
          draft_metadata: {
            editor: "claim-row-editor-v1",
            payload_version: "admin-document-draft-v1",
            claim_fields: ["field_path", "claim_text", "claim_value", "jurisdiction", "required_source_type", "source_hint"],
            autosave_ready: true,
            edit_history_ready: true,
          },
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
        setSlug(""); setTitle(""); setCategory(""); replaceClaimRows(DEFAULT_CLAIM_ROWS);
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
        <h1>새 문서 생성</h1>
        <p>새 문서와 검증 대기 사실 항목을 함께 생성합니다. 모든 사실은 <strong>확인 필요 / 낮은 신뢰도 / 검토 필요</strong> 상태로 시작합니다.</p>
        <AdminDbDetails>
          Supabase <code>documents</code> + <code>claims</code> + <code>listings</code> 테이블에 직접 저장합니다.
          초기 DB 상태값: low / needs_review
        </AdminDbDetails>
      </header>

      {result && (
        <section className="registry-panel" style={{ background: result.success ? "#f0fdf4" : "#fef2f2", borderLeft: `3px solid ${result.success ? "#16a34a" : "#dc2626"}` }} aria-live="polite">
          {result.success ? (<><h2>생성 완료</h2><p>문서 ID: <code>{result.document_id}</code></p><p>사실 생성: {result.claims_created}개</p>{result.url && (<p style={{ marginTop: 8 }}><a href={result.url} style={{ color: "#2563eb" }}>위키 페이지 보기 → {result.url}</a></p>)}</>) : (<><h2>오류</h2><p>{result.error}</p></>)}
        </section>
      )}

      <section className="registry-panel" aria-labelledby="document-form-title">
        <h2 id="document-form-title">문서 필드</h2>
        <form onSubmit={handleSubmit} className="registry-form">
          <label>대상 ID <span aria-label="필수">*</span><input type="text" value={entityId} onChange={e => setEntityId(e.target.value)} required placeholder="kr-person-athlete-ryu-hyun-jin-001" /></label>
          <label>Slug (URL) <span aria-label="필수">*</span><input type="text" value={slug} onChange={e => setSlug(e.target.value)} required placeholder="ryu-hyun-jin-stats" /></label>
          <label>Language<input type="text" value={lang} onChange={e => setLang(e.target.value)} required placeholder="ko" /></label>
          <label>Country <span aria-label="필수">*</span><input type="text" value={country} onChange={e => { setCountry(e.target.value); if (!jurisdiction) setJurisdiction(e.target.value); }} required placeholder="KR" /></label>
          <label>Jurisdiction (기본 claim 관할)<input type="text" value={jurisdiction} onChange={e => setJurisdiction(e.target.value)} placeholder="KR, US-CA, EU" /></label>
          <label>Title <span aria-label="필수">*</span><input type="text" value={title} onChange={e => setTitle(e.target.value)} required placeholder="류현진 기본 정보" /></label>
          <label>Category <span aria-label="필수">*</span><input type="text" value={category} onChange={e => setCategory(e.target.value)} required placeholder="person_athlete" /></label>
          <label>Template<input type="text" value={template} onChange={e => setTemplate(e.target.value)} required placeholder="fact-sheet" /></label>

          <section aria-labelledby="claim-row-editor-title" style={{ display: "grid", gap: 12 }}>
            <div>
              <h3 id="claim-row-editor-title" style={{ marginBottom: 4 }}>사실 항목 편집기</h3>
              <p style={{ margin: 0, color: "#6b7280", fontSize: 13 }}>기본 입력은 행 단위입니다. 각 행은 공개 문서에 표시될 하나의 검증 대기 사실입니다.</p>
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              {claimRows.map((row, index) => (
                <fieldset key={row.id} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, display: "grid", gap: 10 }}>
                  <legend style={{ padding: "0 6px", fontWeight: 700 }}>사실 {index + 1}</legend>
                  <label>{adminLabel("field_path")}<input value={row.field_path} onChange={e => updateClaimRow(row.id, { field_path: e.target.value })} placeholder="parking.availability" /></label>
                  <label>question / claim_text<input value={row.claim_text} onChange={e => updateClaimRow(row.id, { claim_text: e.target.value })} placeholder="주차 가능 여부는?" /></label>
                  <label>placeholder value<input value={row.placeholder_value} onChange={e => updateClaimRow(row.id, { placeholder_value: e.target.value })} placeholder="확인 필요" /></label>
                  <label>jurisdiction<input value={row.jurisdiction} onChange={e => updateClaimRow(row.id, { jurisdiction: e.target.value })} placeholder={normalizedJurisdiction || "KR"} /></label>
                  <label>required source type<select value={row.required_source_type} onChange={e => updateClaimRow(row.id, { required_source_type: e.target.value })}>{SOURCE_TYPE_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}</select></label>
                  <label>source hint<input value={row.source_hint} onChange={e => updateClaimRow(row.id, { source_hint: e.target.value })} placeholder="검증자가 찾아야 할 출처 힌트" /></label>
                  <button type="button" onClick={() => replaceClaimRows(claimRows.filter(item => item.id !== row.id))} disabled={claimRows.length === 1}>행 삭제</button>
                </fieldset>
              ))}
            </div>
            <button type="button" onClick={() => replaceClaimRows([...claimRows, makeClaimRow({ jurisdiction: normalizedJurisdiction })])}>사실 행 추가</button>
          </section>

          <label>사실 대량 입력 (줄당 1개, 형식: <code>field_path::질문::placeholder::jurisdiction::source_type::source_hint</code>)<textarea value={claimsText} onChange={e => handleClaimsTextChange(e.target.value)} placeholder={CLAIM_PLACEHOLDER} rows={6} /></label>

          <section className="registry-panel" aria-labelledby="wiki-preview-title" style={{ background: "#f9fafb" }}>
            <h3 id="wiki-preview-title">저장 전 공개 위키 미리보기</h3>
            <p className="eyebrow">/{lang || "ko"}/wiki/{slug || "slug"}</p>
            <h2>{title || "문서 제목"}</h2>
            <p style={{ color: "#6b7280" }}>{category || "category"} · {country || "country"} · 신뢰도 낮음 · 검토 필요</p>
            <div style={{ display: "grid", gap: 10 }}>
              {claimsPayload.length > 0 ? claimsPayload.map(claim => (
                <article key={claim.field_path} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, background: "#fff" }}>
                  <strong>{claim.claim_text}</strong>
                  <p style={{ margin: "6px 0" }}>{claim.claim_value}</p>
                  <small>{adminLabel("field_path")}: {claim.field_path}</small>
                  <AdminDbDetails>
                    jurisdiction: {claim.jurisdiction} · source required: {claim.required_source_type}
                  </AdminDbDetails>
                  {claim.source_hint && <p style={{ margin: "6px 0 0", color: "#6b7280" }}>출처 힌트: {claim.source_hint}</p>}
                </article>
              )) : <p>아직 입력된 claim이 없습니다.</p>}
            </div>
          </section>

          <AdminSecretField adminSecret={adminSecret} setAdminSecret={setAdminSecret} resetAdminSecret={resetAdminSecret} label="관리자 로그인" placeholder="관리자 비밀키" />
          <button type="submit" disabled={loading}>{loading ? "생성 중..." : "문서 생성"}</button>
        </form>
      </section>

      <section className="registry-panel" aria-labelledby="claims-format-guide">
        <h2 id="claims-format-guide">사실 형식 및 API payload 안내</h2>
        <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.7 }}>각 행은 하나의 사실입니다. textarea는 대량 붙여넣기용으로 유지되며 <code>field_path::질문::placeholder::jurisdiction::source_type::source_hint</code> 순서를 사용합니다. 저장 payload의 <code>claims[]</code>는 <code>field_path</code>, <code>claim_text</code>, <code>claim_value</code>, <code>placeholder_value</code>, <code>jurisdiction</code>, <code>required_source_type</code>, <code>source_hint</code>를 포함합니다. <code>draft_metadata.payload_version</code>과 <code>draft_metadata.editor</code>는 이후 draft autosave 및 edit history 연결 지점입니다.</p>
      </section>
    </article>
  );
}
