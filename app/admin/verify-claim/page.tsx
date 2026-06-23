"use client";

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

  const load = useCallback(async () => {
    if (!secret) return;
    setLoading(true);
    const res = await fetch("/api/admin/verify-claim", { headers: { "x-admin-secret": secret } });
    const data = await res.json();
    setLoading(false);
    if (res.ok) setDocuments(Array.isArray(data.documents) ? data.documents : []);
    else setMessage({ ok: false, text: data.error ?? "claim 목록 조회 실패" });
  }, [secret]);

  useEffect(() => { load(); }, [load]);

  function openVerify(claim: ClaimRow) {
    setSelectedClaim(claim);
    setClaimValue(claim.claim_value === "확인 필요" ? "" : claim.claim_value);
    setTitle("");
    setUrl("");
    setCitation("");
    setSourceType("official");
    setConfidence("high");
  }

  async function submitVerify() {
    if (!selectedClaim) return;
    const res = await fetch("/api/admin/verify-claim", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-secret": secret },
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
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "40px 20px" }}>
      <nav style={{ marginBottom: 24, fontSize: 13 }}><Link href="/admin/review">← Admin</Link></nav>
      <h1>Claim 검증 관리</h1>
      <p style={{ color: "#6b7280" }}>Promoted 문서의 claim에 출처를 붙이고 verified 상태로 승격합니다.</p>

      <section className="registry-panel">
        <label style={{ fontWeight: 600 }}>Admin secret</label>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="ADMIN_SECRET" style={{ flex: 1, padding: 8 }} />
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
        <section className="registry-panel" key={doc.id}>
          <h2><Link href={`/ko/wiki/${doc.slug}`}>{doc.title}</Link></h2>
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
          <label>출처 URL<input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." /></label>
          <label>citation / 메모<textarea value={citation} onChange={(e) => setCitation(e.target.value)} placeholder="어떤 문구/근거를 확인했는지" /></label>
          <label>confidence<select value={confidence} onChange={(e) => setConfidence(e.target.value)}><option value="high">high</option><option value="medium">medium</option></select></label>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={submitVerify}>저장하고 verified로 승격</button>
            <button onClick={() => setSelectedClaim(null)} type="button">취소</button>
          </div>
        </section>
      )}
    </main>
  );
}
