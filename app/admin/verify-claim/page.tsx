"use client";
import { ensureAdminSession } from "@/lib/admin-client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type SourceRow = { id: string; title?: string | null; url?: string | null; source_type?: string | null };
type ClaimRow = {
  id: string;
  field_path: string;
  claim_text: string;
  claim_value: string;
  confidence: string;
  status: string;
  last_verified_at?: string | null;
  claim_sources?: SourceRow[];
};
type DocumentRow = {
  id: string;
  slug: string;
  title: string;
  status: string;
  confidence: string;
  lang?: string;
  claims?: ClaimRow[];
};

const SOURCE_TYPES = ["official", "platform", "document", "web", "review", "other"];

export default function VerifyClaimPage() {
  const [secret, setSecret] = useState("");
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState<ClaimRow | null>(null);
  const [claimValue, setClaimValue] = useState("");
  const [sourceType, setSourceType] = useState("official");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [citation, setCitation] = useState("");
  const [confidence, setConfidence] = useState("high");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [sourceCheck, setSourceCheck] = useState<{
    reachable: boolean;
    status: number;
    error?: string;
    exact_match?: boolean | null;
    token_match?: { matched: string[]; missing: string[] } | null;
    snippet?: string | null;
  } | null>(null);

  const load = useCallback(async () => {
    if (!secret) return;
    setLoading(true);
    try { await ensureAdminSession(secret); } catch (e) { setLoading(false); setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) }); return; }
    const res = await fetch("/api/admin/verify-claim", { credentials: "same-origin" });
    const data = await res.json();
    setLoading(false);
    if (res.ok) setDocuments(Array.isArray(data.documents) ? data.documents : []);
    else setMessage({ ok: false, text: data.error ?? "claim 목록 조회 실패" });
  }, [secret]);

  const [targetSlug, setTargetSlug] = useState<string | null>(null);

  useEffect(() => { load(); }, [load]);

  // Deep-link target: /admin/verify-claim?slug=<slug> (set by candidates promote flow)
  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get("slug");
    if (slug) setTargetSlug(slug);
  }, []);

  // Once documents load, scroll the targeted doc into view and open its first unverified claim.
  useEffect(() => {
    if (!targetSlug || documents.length === 0) return;
    const doc = documents.find((d) => d.slug === targetSlug);
    if (!doc) return;
    const el = document.getElementById(`doc-${doc.slug}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    const firstUnverified = (doc.claims ?? []).find((c) => c.status !== "verified");
    if (firstUnverified) openVerify(firstUnverified);
    setTargetSlug(null);
  }, [targetSlug, documents]);

  function openVerify(claim: ClaimRow) {
    setSelectedClaim(claim);
    setClaimValue(claim.claim_value === "확인 필요" ? "" : claim.claim_value);
    setTitle("");
    setUrl("");
    setCitation("");
    setSourceType("official");
    setConfidence("high");
    setSourceCheck(null);
  }

  async function checkSource() {
    if (!url.trim()) {
      setMessage({ ok: false, text: "확인할 출처 URL을 입력하세요" });
      return;
    }
    setChecking(true);
    setSourceCheck(null);
    try {
      await ensureAdminSession(secret);
      const res = await fetch("/api/admin/check-source", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-csrf": "1" },
        body: JSON.stringify({ url: url.trim(), match: claimValue.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ ok: false, text: data.error ?? "출처 확인 실패" });
      } else {
        setSourceCheck(data);
      }
    } catch (e) {
      setMessage({ ok: false, text: `출처 확인 오류: ${String(e)}` });
    } finally {
      setChecking(false);
    }
  }

  async function submitVerify() {
    if (!selectedClaim) return;
    try { await ensureAdminSession(secret); } catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) }); return; }
    const res = await fetch("/api/admin/verify-claim", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-csrf": "1" },
      body: JSON.stringify({
        claim_id: selectedClaim.id,
        claim_value: claimValue,
        source_type: sourceType,
        title,
        url,
        citation,
        confidence,
        observed_at: new Date().toISOString(),
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setMessage({ ok: true, text: "검증 저장 완료" });
      setSelectedClaim(null);
      await load();
    } else {
      setMessage({ ok: false, text: data.error ?? "검증 저장 실패" });
    }
  }

  const allClaims = documents.flatMap((doc) => (doc.claims ?? []).map((claim) => ({ doc, claim })));
  const reviewCount = allClaims.filter(({ claim }) => claim.status !== "verified").length;
  const verifiedCount = allClaims.filter(({ claim }) => claim.status === "verified").length;

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "40px 20px" }}>
      <nav style={{ marginBottom: 24, fontSize: 13 }}><Link href="/admin/review">← Admin</Link></nav>
      <h1>Claim 검증 관리</h1>
      <p style={{ color: "#6b7280" }}>Promoted 문서의 claim에 출처를 붙이고 verified 상태로 승격합니다.</p>
      <p style={{ color: "#374151", fontSize: 13 }}>
        승격 전 반드시 <Link href="/admin/verification-policy">verified 승격 기준 문서</Link>를 확인하세요.
        AI 생성 후보는 사람이 출처를 검토하기 전까지 verified로 올릴 수 없습니다.
      </p>

      <section className="registry-panel">
        <label style={{ fontWeight: 600 }}>Admin password</label>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="관리자 비밀번호" style={{ flex: 1, padding: 8 }} />
          <button onClick={load} disabled={!secret || loading}>{loading ? "불러오는 중..." : "불러오기"}</button>
        </div>
      </section>

      {message && <div style={{ padding: 12, marginBottom: 16, borderRadius: 8, background: message.ok ? "#f0fdf4" : "#fef2f2", color: message.ok ? "#166534" : "#991b1b" }}>{message.text}</div>}

      <div className="stat-strip">
        <div className="stat"><span className="stat-num">{allClaims.length}</span><span className="stat-label">전체 claim</span></div>
        <div className="stat"><span className="stat-num">{reviewCount}</span><span className="stat-label">확인 필요</span></div>
        <div className="stat"><span className="stat-num">{verifiedCount}</span><span className="stat-label">검증됨</span></div>
      </div>

      {documents.map((doc) => (
        <section className="registry-panel" key={doc.id} id={`doc-${doc.slug}`}>
          <h2><Link href={`/${doc.lang??"en"}/wiki/${doc.slug}`}>{doc.title}</Link></h2>
          <p className="meta-label">{doc.slug} · {doc.status} · {doc.confidence}</p>
          {(doc.claims ?? []).map((claim) => (
            <div className="claim-card" key={claim.id}>
              <p className="eyebrow">{claim.field_path}</p>
              <p><strong>{claim.claim_value}</strong></p>
              <p>{claim.claim_text}</p>
              <p><span className="badge">status: {claim.status}</span> <span className="badge">confidence: {claim.confidence}</span> <span className="badge">sources: {claim.claim_sources?.length ?? 0}</span></p>
              {(claim.claim_sources?.length ?? 0) > 0 && <ul>{claim.claim_sources?.map((source) => <li key={source.id}><a href={source.url ?? "#"}>{source.title ?? source.url ?? source.source_type}</a></li>)}</ul>}
              {claim.status !== "verified" && <button onClick={() => openVerify(claim)}>출처 추가 + verified 승격</button>}
            </div>
          ))}
        </section>
      ))}

      {selectedClaim && (
        <section className="registry-panel" style={{ borderColor: "#2563eb" }}>
          <h2>Claim 검증</h2>
          <p className="meta-label">{selectedClaim.field_path}</p>
          <label>검증된 값<input value={claimValue} onChange={(e) => setClaimValue(e.target.value)} placeholder="확인된 값" /></label>
          <label>source_type<select value={sourceType} onChange={(e) => setSourceType(e.target.value)}>{SOURCE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
          <label>출처 제목<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="공식 페이지명" /></label>
          <label>출처 URL
            <div style={{ display: "flex", gap: 8 }}>
              <input value={url} onChange={(e) => { setUrl(e.target.value); setSourceCheck(null); }} placeholder="https://..." style={{ flex: 1 }} />
              <button type="button" onClick={checkSource} disabled={checking || !url.trim()}>{checking ? "확인 중..." : "출처 확인"}</button>
            </div>
          </label>
          {sourceCheck && (
            <div style={{ padding: 12, borderRadius: 8, fontSize: 13, background: sourceCheck.reachable ? "#f0fdf4" : "#fef2f2", border: `1px solid ${sourceCheck.reachable ? "#86efac" : "#fecaca"}` }}>
              <p style={{ margin: "0 0 6px", fontWeight: 600 }}>
                {sourceCheck.reachable ? `✓ 도달 가능 (HTTP ${sourceCheck.status})` : `✗ 도달 실패${sourceCheck.status ? ` (HTTP ${sourceCheck.status})` : ""}`}
                {sourceCheck.error && <span style={{ color: "#b91c1c", fontWeight: 400 }}> — {sourceCheck.error}</span>}
              </p>
              {sourceCheck.exact_match === true && <p style={{ margin: "0 0 4px", color: "#166534" }}>✓ 입력한 값이 페이지 본문에 그대로 존재합니다</p>}
              {sourceCheck.exact_match === false && sourceCheck.token_match && (
                <p style={{ margin: "0 0 4px", color: "#92400e" }}>
                  부분 일치: {sourceCheck.token_match.matched.length}개 토큰 확인
                  {sourceCheck.token_match.matched.length > 0 && ` (${sourceCheck.token_match.matched.join(", ")})`}
                  {sourceCheck.token_match.missing.length > 0 && ` · 미발견: ${sourceCheck.token_match.missing.join(", ")}`}
                </p>
              )}
              {sourceCheck.snippet && <p style={{ margin: "4px 0 0", color: "#374151", fontStyle: "italic" }}>…{sourceCheck.snippet}…</p>}
              <p style={{ margin: "6px 0 0", fontSize: 11, color: "#6b7280" }}>본문 자동 매칭은 보조 수단입니다 — 반드시 직접 확인 후 저장하세요.</p>
            </div>
          )}
          <label>citation / 메모<textarea value={citation} onChange={(e) => setCitation(e.target.value)} placeholder="어떤 문구/근거를 확인했는지" /></label>
          <label>confidence<select value={confidence} onChange={(e) => setConfidence(e.target.value)}><option value="high">high</option><option value="medium">medium</option></select></label>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={submitVerify}>저장하고 verified로 승격</button>
            <button onClick={() => setSelectedClaim(null)} type="button">취소</button>
          </div>
        </section>
      )}
    </div>
  );
}
