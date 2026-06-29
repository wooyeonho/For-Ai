"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type SourceRow = { id: string; title?: string | null; url?: string | null; source_type?: string | null; citation?: string | null; observed_at?: string | null };
type VerificationEventRow = { id: string; note?: string | null; created_at?: string | null; new_status?: string | null };
type SourceCandidate = { title?: string; url?: string; source_type?: string; citation?: string };
type ClaimRow = {
  id: string;
  field_path: string;
  claim_text: string;
  claim_value: string;
  confidence: string;
  status: string;
  last_verified_at?: string | null;
  contributor_hash?: string | null;
  submitter?: string | null;
  ai_provider?: string | null;
  ai_model?: string | null;
  source_candidates?: SourceCandidate[];
  claim_sources?: SourceRow[];
  verification_events?: VerificationEventRow[];
};
type DocumentRow = {
  id: string;
  slug: string;
  title: string;
  country?: string;
  category?: string;
  status: string;
  confidence: string;
  lang?: string;
  entity_id?: string;
  source_hints?: SourceCandidate[];
  ai_provider?: string | null;
  ai_model?: string | null;
  claims?: ClaimRow[];
};
type ClaimListMeta = { count: number; limit: number; offset: number; has_more: boolean };

const SOURCE_TYPES = ["official", "law", "platform", "document", "web", "review", "user", "phone", "photo", "other", "unknown"];
const SOURCE_TRUST: Record<string, number> = { official: 95, platform: 85, document: 80, web: 65, photo: 60, phone: 55, review: 40, user: 30, other: 25, unknown: 0 };
function trustScore(sourceType?: string | null, url?: string | null, citation?: string | null) {
  const base = SOURCE_TRUST[sourceType ?? "unknown"] ?? 0;
  return Math.min(100, base + (url ? 3 : 0) + (citation ? 2 : 0));
}

export default function VerifyClaimPage() {
  const [secret, setSecret] = useState("");
  const [adminActor, setAdminActor] = useState("");
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState<ClaimRow | null>(null);
  const [claimValue, setClaimValue] = useState("");
  const [sourceType, setSourceType] = useState("official");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [citation, setCitation] = useState("");
  const [confidence, setConfidence] = useState("high");
  const [localFilters, setLocalFilters] = useState({ country: "all", domain: "all", source: "all", confidence: "all", status: "all", stale: "all" });
  const [selectedClaimIds, setSelectedClaimIds] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [sourceCheck, setSourceCheck] = useState<{
    reachable: boolean;
    status: number;
    error?: string;
    exact_match?: boolean | null;
    token_match?: { matched: string[]; missing: string[] } | null;
    snippet?: string | null;
    extracted_title?: string | null;
    source_check_status?: "unchecked" | "passed" | "warning" | "failed";
    source_trust_score?: number;
    source_check_notes?: string[];
    source_check_details?: Record<string, boolean | null>;
  } | null>(null);
  const [filters, setFilters] = useState({
    status: "needs_review",
    country: "",
    lang: "",
    category: "",
    slug: "",
    sort: "high_risk",
    limit: "50",
    offset: "0",
  });
  const [meta, setMeta] = useState<ClaimListMeta>({ count: 0, limit: 50, offset: 0, has_more: false });

  const load = useCallback(async () => {
    if (!secret) return;
    setLoading(true);
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value.trim()) params.set(key, value.trim());
    });
    const res = await fetch(`/api/admin/verify-claim?${params.toString()}`, { headers: { "x-admin-secret": secret, ...(adminActor.trim() ? { "x-admin-actor": adminActor.trim() } : {}) } });
    const data = await res.json();
    setLoading(false);
    if (res.ok) {
      setDocuments(Array.isArray(data.documents) ? data.documents : []);
      setMeta({
        count: Number(data.count ?? 0),
        limit: Number(data.limit ?? filters.limit),
        offset: Number(data.offset ?? filters.offset),
        has_more: Boolean(data.has_more),
      });
    }
    else setMessage({ ok: false, text: data.error ?? "claim 목록 조회 실패" });
  }, [filters, secret]);

  const [targetSlug, setTargetSlug] = useState<string | null>(null);

  useEffect(() => { load(); }, [load]);

  // Deep-link target: /admin/verify-claim?slug=<slug> (set by candidates promote flow)
  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get("slug");
    if (slug) {
      setTargetSlug(slug);
      setFilters((current) => ({ ...current, slug, offset: "0" }));
    }
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
      const res = await fetch("/api/admin/check-source", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-secret": secret, "x-admin-csrf": "1", ...(adminActor.trim() ? { "x-admin-actor": adminActor.trim() } : {}) },
        body: JSON.stringify({
          url: url.trim(),
          match: claimValue.trim(),
          claim_text: selectedClaim?.claim_text ?? "",
          source_type: sourceType,
          title: title.trim(),
          observed_at: new Date().toISOString(),
        }),
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

  async function runClaimAction(action: "verify" | "reject" | "mark_unknown" | "edit_value" | "attach_source" | "promote_document") {
    if (!selectedClaim) return;
    const res = await fetch("/api/admin/verify-claim", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-secret": secret, "x-admin-csrf": "1", ...(adminActor.trim() ? { "x-admin-actor": adminActor.trim() } : {}) },
      body: JSON.stringify({
        action,
        claim_id: selectedClaim.id,
        claim_value: claimValue,
        source_type: sourceType,
        title,
        url,
        citation,
        confidence,
        observed_at: new Date().toISOString(),
        claim_text: selectedClaim.claim_text,
        fetch_ok: sourceCheck?.reachable ?? null,
        source_check_status: sourceCheck?.source_check_status ?? "unchecked",
        source_trust_score: sourceCheck?.source_trust_score ?? 0,
        source_check_notes: sourceCheck?.source_check_notes ?? [],
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setMessage({ ok: true, text: `액션 저장 완료: ${action}` });
      setSelectedClaim(null);
      await load();
    } else {
      setMessage({ ok: false, text: data.error ?? "액션 저장 실패" });
    }
  }


  async function markClaim(action: "needs_verification" | "reject", claim: ClaimRow) {
    const actionReason = window.prompt(action === "reject" ? "Rejected reason" : "Needs-verification reason", reason);
    if (!actionReason?.trim()) return;
    const res = await fetch("/api/admin/verify-claim", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-secret": secret, "x-admin-csrf": "1", ...(adminActor.trim() ? { "x-admin-actor": adminActor.trim() } : {}) },
      body: JSON.stringify({ action, claim_id: claim.id, reason: actionReason.trim() }),
    });
    const data = await res.json();
    if (res.ok) {
      setMessage({ ok: true, text: action === "reject" ? "rejected/disputed 처리 완료" : "needs verification 처리 완료" });
      setReason(actionReason.trim());
      await load();
    } else {
      setMessage({ ok: false, text: data.error ?? "상태 변경 실패" });
    }
  }

  async function bulkNeedsVerification() {
    if (selectedClaimIds.length === 0) return;
    if (!reason.trim()) {
      setMessage({ ok: false, text: "bulk needs-verification reason을 입력하세요" });
      return;
    }
    const res = await fetch("/api/admin/verify-claim", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-secret": secret, "x-admin-csrf": "1", ...(adminActor.trim() ? { "x-admin-actor": adminActor.trim() } : {}) },
      body: JSON.stringify({ action: "bulk_needs_verification", claim_ids: selectedClaimIds, reason: reason.trim() }),
    });
    const data = await res.json();
    if (res.ok) {
      setMessage({ ok: true, text: `${selectedClaimIds.length}개 claim을 needs verification으로 처리했습니다` });
      setSelectedClaimIds([]);
      await load();
    } else {
      setMessage({ ok: false, text: data.error ?? "bulk 처리 실패" });
    }
  }

  function isStale(claim: ClaimRow) {
    if (claim.status !== "verified" || !claim.last_verified_at) return false;
    return Date.now() - new Date(claim.last_verified_at).getTime() > 180 * 24 * 60 * 60 * 1000;
  }

  async function submitVerify() { return runClaimAction("verify"); }

  const allClaims = documents.flatMap((doc) => (doc.claims ?? []).map((claim) => ({ doc, claim })));
  const countries = [...new Set(documents.map((doc) => doc.country).filter(Boolean))].sort();
  const domains = [...new Set(documents.map((doc) => doc.category).filter(Boolean))].sort();
  const filteredClaims = allClaims.filter(({ doc, claim }) => {
    const sourceCount = claim.claim_sources?.length ?? 0;
    return (localFilters.country === "all" || doc.country === localFilters.country)
      && (localFilters.domain === "all" || doc.category === localFilters.domain)
      && (localFilters.source === "all" || (localFilters.source === "present" ? sourceCount > 0 : sourceCount === 0))
      && (localFilters.confidence === "all" || claim.confidence === localFilters.confidence)
      && (localFilters.status === "all" || claim.status === localFilters.status)
      && (localFilters.stale === "all" || (localFilters.stale === "stale" ? isStale(claim) : !isStale(claim)));
  });
  const visibleDocIds = new Set(filteredClaims.map(({ doc }) => doc.id));
  const visibleClaimIds = new Set(filteredClaims.map(({ claim }) => claim.id));
  const reviewCount = allClaims.filter(({ claim }) => claim.status !== "verified").length;
  const verifiedCount = allClaims.filter(({ claim }) => claim.status === "verified").length;

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "40px 20px" }}>
      <nav style={{ marginBottom: 24, fontSize: 13 }}><Link href="/admin/review">← Admin</Link></nav>
      <h1>Claim 검증 관리</h1>
      <p style={{ color: "#6b7280" }}>Promoted 문서의 claim별 승인 흐름을 관리합니다: verify, reject, unknown, value edit, source attach, 전체 verified 시 document promotion.</p>
      <p style={{ color: "#374151", fontSize: 13 }}>
        승격 전 반드시 <a href="/docs/operations/CLAIM_VERIFICATION_POLICY.md">verified 승격 기준 문서</a>를 확인하세요.
        AI 생성 후보는 사람이 출처를 검토하기 전까지 verified로 올릴 수 없습니다.
      </p>

      <section className="registry-panel">
        <label style={{ fontWeight: 600 }}>Admin secret</label>
        <input value={adminActor} onChange={(e) => setAdminActor(e.target.value)} placeholder="admin actor (email/name; hashed in audit log)" style={{ width: "100%", padding: 8, marginTop: 8 }} />
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="ADMIN_SECRET" style={{ flex: 1, padding: 8 }} />
          <button onClick={load} disabled={!secret || loading}>{loading ? "불러오는 중..." : "불러오기"}</button>
        </div>
      </section>

      <section className="registry-panel">
        <h2>필터</h2>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
          <label>status
            <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value, offset: "0" })}>
              <option value="needs_review">needs_review</option>
              <option value="unknown">unknown</option>
              <option value="disputed">disputed</option>
              <option value="verified">verified</option>
            </select>
          </label>
          <label>country<input value={filters.country} onChange={(e) => setFilters({ ...filters, country: e.target.value, offset: "0" })} placeholder="KR, US, global" /></label>
          <label>lang<input value={filters.lang} onChange={(e) => setFilters({ ...filters, lang: e.target.value, offset: "0" })} placeholder="ko, en, ja..." /></label>
          <label>category<input value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value, offset: "0" })} placeholder="government, banking..." /></label>
          <label>slug<input value={filters.slug} onChange={(e) => setFilters({ ...filters, slug: e.target.value, offset: "0" })} placeholder="slug 검색" /></label>
          <label>정렬
            <select value={filters.sort} onChange={(e) => setFilters({ ...filters, sort: e.target.value, offset: "0" })}>
              <option value="high_risk">high-risk 우선 + 오래된 순</option>
              <option value="oldest">오래된 순</option>
            </select>
          </label>
          <label>limit<input type="number" min="1" max="200" value={filters.limit} onChange={(e) => setFilters({ ...filters, limit: e.target.value, offset: "0" })} /></label>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <button onClick={load} disabled={!secret || loading}>{loading ? "적용 중..." : "필터 적용"}</button>
          <button type="button" onClick={() => setFilters({ status: "needs_review", country: "", lang: "", category: "", slug: "", sort: "high_risk", limit: "50", offset: "0" })}>초기화</button>
        </div>
      </section>

      {message && <div style={{ padding: 12, marginBottom: 16, borderRadius: 8, background: message.ok ? "#f0fdf4" : "#fef2f2", color: message.ok ? "#166534" : "#991b1b" }}>{message.text}</div>}

      <section className="registry-panel">
        <h2>검증 대기 claim 필터</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
          <label>country<select value={localFilters.country} onChange={(e) => setLocalFilters({ ...localFilters, country: e.target.value })}><option value="all">all</option>{countries.map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
          <label>domain<select value={localFilters.domain} onChange={(e) => setLocalFilters({ ...localFilters, domain: e.target.value })}><option value="all">all</option>{domains.map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
          <label>source<select value={localFilters.source} onChange={(e) => setLocalFilters({ ...localFilters, source: e.target.value })}><option value="all">all</option><option value="present">present</option><option value="missing">missing</option></select></label>
          <label>confidence<select value={localFilters.confidence} onChange={(e) => setLocalFilters({ ...localFilters, confidence: e.target.value })}><option value="all">all</option><option value="low">low</option><option value="medium">medium</option><option value="high">high</option></select></label>
          <label>status<select value={localFilters.status} onChange={(e) => setLocalFilters({ ...localFilters, status: e.target.value })}><option value="all">all</option><option value="needs_review">needs_review</option><option value="verified">verified</option><option value="disputed">disputed/rejected</option><option value="unknown">unknown</option></select></label>
          <label>stale<select value={localFilters.stale} onChange={(e) => setLocalFilters({ ...localFilters, stale: e.target.value })}><option value="all">all</option><option value="stale">stale</option><option value="fresh">not stale</option></select></label>
        </div>
        <p className="meta-label">표시 중: {filteredClaims.length} / {allClaims.length} claims · bulk verify는 비활성화되어 있고, bulk needs-verification만 허용됩니다.</p>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="bulk reason" style={{ flex: 1 }} />
          <button type="button" onClick={bulkNeedsVerification} disabled={selectedClaimIds.length === 0}>선택 claim needs-verification 처리 ({selectedClaimIds.length})</button>
          <button type="button" disabled title="위험 방지를 위해 초기 버전에서는 비활성화">bulk verify 비활성화</button>
        </div>
      </section>

      <div className="stat-strip">
        <div className="stat"><span className="stat-num">{allClaims.length}</span><span className="stat-label">전체 claim</span></div>
        <div className="stat"><span className="stat-num">{reviewCount}</span><span className="stat-label">확인 필요</span></div>
        <div className="stat"><span className="stat-num">{verifiedCount}</span><span className="stat-label">검증됨</span></div>
        <div className="stat"><span className="stat-num">{meta.count}</span><span className="stat-label">필터 결과</span></div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16, fontSize: 13, color: "#4b5563" }}>
        <span>{meta.count}개 중 {meta.count === 0 ? 0 : meta.offset + 1}-{Math.min(meta.offset + meta.limit, meta.count)} 표시 · limit {meta.limit}</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" disabled={loading || meta.offset <= 0} onClick={() => setFilters({ ...filters, offset: String(Math.max(0, meta.offset - meta.limit)) })}>이전</button>
          <button type="button" disabled={loading || !meta.has_more} onClick={() => setFilters({ ...filters, offset: String(meta.offset + meta.limit) })}>다음</button>
        </div>
      </div>

      {documents.filter((doc) => visibleDocIds.has(doc.id)).map((doc) => (
        <section className="registry-panel" key={doc.id} id={`doc-${doc.slug}`}>
          <h2><Link href={`/${doc.lang??"en"}/wiki/${doc.slug}`}>{doc.title}</Link></h2>
          <p className="meta-label">{doc.slug} · {doc.country ?? "?"} · {doc.lang ?? "?"} · {doc.category ?? "?"} · {doc.status} · {doc.confidence}</p>
          {(doc.claims ?? []).map((claim) => (
            <div className="claim-card" key={claim.id}>
              <label style={{ float: "right", fontSize: 12 }}><input type="checkbox" checked={selectedClaimIds.includes(claim.id)} onChange={(e) => setSelectedClaimIds((ids) => e.target.checked ? [...ids, claim.id] : ids.filter((id) => id !== claim.id))} /> bulk 선택</label>
              <p className="eyebrow">entity_id: {doc.entity_id ?? "-"} · document_id: {doc.id} · field_path: {claim.field_path}</p>
              <p><strong>{claim.claim_value}</strong></p>
              <p>{claim.claim_text}</p>
              <p>
                <span className="badge">status: {claim.status}</span> <span className="badge">confidence: {claim.confidence}</span>
                <span className="badge">sources: {claim.claim_sources?.length ?? 0}</span>
                <span className="badge">last_verified_at: {claim.last_verified_at ?? "확인 필요"}</span>
                {isStale(claim) && <span className="badge">stale</span>}
              </p>
              <p className="meta-label">submitter: {claim.submitter ?? claim.contributor_hash ?? "-"} · AI: {[claim.ai_provider, claim.ai_model].filter(Boolean).join(" / ") || "-"}</p>
              {(claim.source_candidates?.length ?? 0) > 0 && (
                <div><strong>source 후보</strong><ul>{claim.source_candidates?.map((source, i) => <li key={`${source.url ?? source.title ?? i}`}>{source.source_type ?? "web"} · trust {trustScore(source.source_type, source.url, source.citation)} · {source.url ? <a href={source.url}>{source.title ?? source.url}</a> : (source.title ?? source.citation)}</li>)}</ul></div>
              )}
              {(claim.claim_sources?.length ?? 0) > 0 && <ul>{claim.claim_sources?.map((source) => <li key={source.id}>{source.source_type} · trust {trustScore(source.source_type, source.url, source.citation)} · <a href={source.url ?? "#"}>{source.title ?? source.url ?? source.citation ?? source.source_type}</a></li>)}</ul>}
              {(claim.verification_events?.length ?? 0) > 0 && <p className="meta-label">latest reason: {claim.verification_events?.at(-1)?.note ?? "—"}</p>}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {claim.status !== "verified" && <button onClick={() => openVerify(claim)}>관리자 액션 열기</button>}
                <button type="button" onClick={() => markClaim("needs_verification", claim)}>needs verification + reason</button>
                <button type="button" onClick={() => markClaim("reject", claim)}>reject/dispute + reason</button>
              </div>
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
              {url.trim() && <a href={url.trim()} target="_blank" rel="noopener noreferrer" style={{ alignSelf: "center" }}>새 탭에서 열기</a>}
            </div>
          </label>
          {sourceCheck && (
            <div style={{ padding: 12, borderRadius: 8, fontSize: 13, background: sourceCheck.reachable ? "#f0fdf4" : "#fef2f2", border: `1px solid ${sourceCheck.reachable ? "#86efac" : "#fecaca"}` }}>
              <p style={{ margin: "0 0 6px", fontWeight: 600 }}>
                {sourceCheck.reachable ? `✓ 도달 가능 (HTTP ${sourceCheck.status})` : `✗ 도달 실패${sourceCheck.status ? ` (HTTP ${sourceCheck.status})` : ""}`}
                {sourceCheck.error && <span style={{ color: "#b91c1c", fontWeight: 400 }}> — {sourceCheck.error}</span>}
              </p>
              {sourceCheck.source_check_status && (
                <p style={{ margin: "0 0 4px", color: sourceCheck.source_check_status === "passed" ? "#166534" : sourceCheck.source_check_status === "warning" ? "#92400e" : "#b91c1c" }}>
                  Source trust: {sourceCheck.source_check_status} · {sourceCheck.source_trust_score ?? 0}/100
                </p>
              )}
              {sourceCheck.extracted_title && <p style={{ margin: "0 0 4px", color: "#374151" }}>추출 title: {sourceCheck.extracted_title}</p>}
              {sourceCheck.source_check_notes && sourceCheck.source_check_notes.length > 0 && (
                <ul style={{ margin: "4px 0", paddingLeft: 18, color: "#6b7280" }}>
                  {sourceCheck.source_check_notes.map((note) => <li key={note}>{note}</li>)}
                </ul>
              )}
              {sourceCheck.exact_match === true && <p style={{ margin: "0 0 4px", color: "#166534" }}>✓ 입력한 값이 페이지 본문에 그대로 존재합니다</p>}
              {sourceCheck.exact_match === false && sourceCheck.token_match && (
                <p style={{ margin: "0 0 4px", color: "#92400e" }}>
                  부분 일치: {sourceCheck.token_match.matched.length}개 토큰 확인
                  {sourceCheck.token_match.matched.length > 0 && ` (${sourceCheck.token_match.matched.join(", ")})`}
                  {sourceCheck.token_match.missing.length > 0 && ` · 미발견: ${sourceCheck.token_match.missing.join(", ")}`}
                </p>
              )}
              {sourceCheck.snippet && <p style={{ margin: "4px 0 0", color: "#374151", fontStyle: "italic" }}>…{sourceCheck.snippet}…</p>}
              <p style={{ margin: "6px 0 0", fontSize: 11, color: "#6b7280" }}>Source check/trust score는 보조 신호입니다 — 통과해도 verified가 아니며 반드시 admin approval 후 저장하세요.</p>
            </div>
          )}
          <label>citation / 메모<textarea value={citation} onChange={(e) => setCitation(e.target.value)} placeholder="어떤 문구/근거를 확인했는지" /></label>
          <label>confidence<select value={confidence} onChange={(e) => setConfidence(e.target.value)}><option value="high">high</option><option value="medium">medium</option></select></label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={submitVerify}>1. verify claim</button>
            <button onClick={() => runClaimAction("reject")} type="button">2. reject claim</button>
            <button onClick={() => runClaimAction("mark_unknown")} type="button">3. mark as unknown</button>
            <button onClick={() => runClaimAction("edit_value")} type="button">4. edit claim value</button>
            <button onClick={() => runClaimAction("attach_source")} type="button">5. attach source</button>
            <button onClick={() => runClaimAction("promote_document")} type="button">6. promote document if all required claims are verified</button>
            <button onClick={() => setSelectedClaim(null)} type="button">취소</button>
          </div>
        </section>
      )}
    </div>
  );
}
