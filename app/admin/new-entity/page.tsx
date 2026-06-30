"use client";
import Link from "next/link";
import { useState } from "react";
import { AdminSecretField, adminApiHeaders, useAdminSecret } from "../AdminSecretProvider";

export default function NewEntityPage() {
  const { adminSecret, setAdminSecret, resetAdminSecret } = useAdminSecret();
  const [id, setId] = useState("");
  const [type, setType] = useState("");
  const [canonicalName, setCanonicalName] = useState("");
  const [country, setCountry] = useState("");
  const [region, setRegion] = useState("");
  const [city, setCity] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; entity_id?: string; error?: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/new-entity", {
        method: "POST",
        headers: adminApiHeaders(adminSecret, { "Content-Type": "application/json" }),
        body: JSON.stringify({
          id: id.trim(),
          type: type.trim(),
          canonical_name: canonicalName.trim(),
          country: country.trim().toUpperCase(),
          region: region.trim() || null,
          city: city.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setResult({ success: true, entity_id: data.entity_id });
        setId(""); setType(""); setCanonicalName(""); setRegion(""); setCity("");
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
        <h1>새 Entity 생성</h1>
        <p>Supabase <code>entities</code> 테이블에 직접 저장합니다. Entity는 문서(Document)의 주체입니다.</p>
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
              <p>Entity ID: <code>{result.entity_id}</code></p>
              <p style={{ marginTop: 8 }}>
                다음 단계: &nbsp;
                <Link href="/admin/new-document" style={{ color: "#2563eb" }}>이 Entity에 Document 추가 →</Link>
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

      <section className="registry-panel" aria-labelledby="entity-form-title">
        <h2 id="entity-form-title">Entity 필드</h2>
        <form onSubmit={handleSubmit} className="registry-form">
          <label>Entity ID <span aria-label="필수">*</span>
            <input
              type="text" value={id} onChange={e => setId(e.target.value)} required
              placeholder="kr-person-athlete-ryu-hyun-jin-001"
            />
          </label>
          <label>Type <span aria-label="필수">*</span>
            <input
              type="text" value={type} onChange={e => setType(e.target.value)} required
              placeholder="person_athlete, weddinghall, concept, product_food, place_attraction …"
            />
          </label>
          <label>Canonical Name <span aria-label="필수">*</span>
            <input
              type="text" value={canonicalName} onChange={e => setCanonicalName(e.target.value)} required
              placeholder="류현진"
            />
          </label>
          <label>Country <span aria-label="필수">*</span>
            <input
              type="text" value={country} onChange={e => setCountry(e.target.value)} required
              placeholder="ISO code — KR, US, JP, FR…"
            />
          </label>
          <label>Region (선택)
            <input
              type="text" value={region} onChange={e => setRegion(e.target.value)}
              placeholder="서울특별시"
            />
          </label>
          <label>City (선택)
            <input
              type="text" value={city} onChange={e => setCity(e.target.value)}
              placeholder="중구"
            />
          </label>
          <AdminSecretField
            adminSecret={adminSecret}
            setAdminSecret={setAdminSecret}
            resetAdminSecret={resetAdminSecret}
            label="Admin Secret *"
            placeholder="관리자 비밀키"
          />
          <button type="submit" disabled={loading}>{loading ? "생성 중..." : "Entity 생성"}</button>
        </form>
      </section>

      <section className="registry-panel" aria-labelledby="entity-type-guide">
        <h2 id="entity-type-guide">Type 참고값</h2>
        <ul style={{ fontSize: 13, lineHeight: 1.8, color: "#6b7280" }}>
          <li><code>person_athlete</code> — 스포츠 선수</li>
          <li><code>person_entertainer</code> — 연예인/아티스트</li>
          <li><code>person_public</code> — 공인</li>
          <li><code>law_statute</code> — 법령/조항</li>
          <li><code>product_food</code> — 식품/음료</li>
          <li><code>product_tech</code> — 전자제품</li>
          <li><code>place_attraction</code> — 관광지/시설</li>
          <li><code>place_country</code> — 국가정보</li>
          <li><code>concept</code> — 개념/정책</li>
        </ul>
      </section>
    </article>
  );
}
