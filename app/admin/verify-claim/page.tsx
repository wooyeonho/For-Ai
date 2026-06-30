"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AdminDbDetails, adminLabel } from "../admin-labels";
import { isHighRiskCategory } from "@/lib/risk-policy";

type SourceRow = { id: string; title?: string | null; url?: string | null; source_type?: string | null; source_authority?: string | null; citation?: string | null; observed_at?: string | null };
type VerificationEventRow = { id: string; note?: string | null; created_at?: string | null; new_status?: string | null };
type SourceCandidate = { id?: string; title?: string; url?: string; source_type?: string; citation?: string; status?: string | null; created_at?: string | null; contributor_hash?: string | null };
type ClaimRow = {
  id: string;
  field_path: string;
  claim_text: string;
  claim_value: string;
  신뢰도: string;
  status: string;
  last_verified_at?: string | null;
  contributor_hash?: string | null;
  submitter?: string | null;
  ai_provider?: string | null;
  ai_model?: string | null;
  source_candidates?: SourceCandidate[];
  claim_sources?: SourceRow[];
  verification_events?: VerificationEventRow[];
  freshness_ttl_days?: number;
  age_days?: number | null;
  stale_reason?: string;
};
type DocumentRow = {
  id: string;
  slug: string;
  title: string;
  country?: string;
  category?: string;
  status: string;
  신뢰도: string;
  lang?: string;
  entity_id?: string;
  source_hints?: SourceCandidate[];
  ai_provider?: string | null;
  ai_model?: string | null;
  claims?: ClaimRow[];
};
type ClaimListMeta = { count: number; limit: number; offset: number; has_more: boolean };
type Pagination = { page: number; limit: number; total: number; total_pages: number };
type ClaimStats = { total: number; needs_review: number; verified: number };

const SOURCE_TYPES = ["official", "law", "platform", "document", "web", "review", "user", "phone", "photo", "other", "unknown"];
const HIGH_RISK_CATEGORIES = new Set(["finance", "banking", "insurance", "healthcare", "genomics", "dna", "government", "labor", "tax", "travel", "real_estate", "housing"]);
const WIZARD_STEPS = ["대상 확인", "claim 확인", "출처 추가", "값 수정", "confidence 선택", "추가 확인", "verified 처리", "공개 페이지 확인"];
const STEP_HELP = [
  "검증할 문서와 entity_id가 맞는지 확인합니다. 다른 문서라면 목록으로 돌아가세요.",
  "claim 문장과 현재 값을 읽고, 무엇을 사실로 확정하려는지 확인합니다.",
  "공개 접근 가능한 출처를 추가합니다. 출처가 하나도 없으면 verified 단계로 이동할 수 없습니다.",
  "출처에서 직접 확인한 값만 입력합니다. 모르면 확인 필요 상태로 남깁니다.",
  "공식/법령/공식 플랫폼은 high, 신뢰 가능한 3자 출처는 medium을 선택합니다.",
  "고위험 카테고리는 금융·의료·정부·여행 등 사용자에게 큰 영향을 줄 수 있어 한 번 더 확인합니다.",
  "출처와 값, confidence를 모두 확인한 뒤 verified로 저장합니다.",
  "완료 후 공개 페이지와 API JSON에서 citation-ready 상태를 확인합니다.",
];
const SOURCE_TRUST: Record<string, number> = { official: 95, platform: 85, document: 80, web: 65, photo: 60, phone: 55, review: 40, user: 30, other: 25, unknown: 0 };
function trustScore(sourceType?: string | null, url?: string | null, citation?: string | null) {
  const base = SOURCE_TRUST[sourceType ?? "unknown"] ?? 0;
  return Math.min(100, base + (url ? 3 : 0) + (citation ? 2 : 0));
}

const POLICY_ITEMS = [
  "AI 생성 후보는 사람이 출처를 검토하기 전까지 검증 완료로 올릴 수 없습니다.",
  "검증할 값이 '확인 필요'인 채로 검증 완료 처리는 금지됩니다.",
  "출처 URL은 반드시 공개 접근 가능한 주소여야 합니다.",
  "인용 근거(citation)에는 페이지 내 실제 문구 또는 수치를 명시해야 합니다.",
  "신뢰도: high — 공식 기관/법령/공식 플랫폼 출처만 해당됩니다.",
  "신뢰도: medium — 신뢰할 수 있는 3자 출처 (리뷰, 언론, 공신력 있는 웹페이지).",
  "한 사실에 복수 출처를 추가하면 신뢰도가 높아집니다. 최소 1개 이상 필수.",
  "출처 자동 확인(출처 확인 버튼)은 보조 수단입니다. 직접 육안으로 확인 후 저장하세요.",
];

function RecommendationPanel({ recommendations }: { recommendations: AdminRecommendation[] }) {
  if (recommendations.length === 0) return null;
  return (
    <div style={{ margin: "10px 0", padding: 12, borderRadius: 8, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <strong style={{ display: "block", marginBottom: 8 }}>운영자 추천 action</strong>
      <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 8 }}>
        {recommendations.map((item) => (
          <li key={`${item.action}-${item.reason}`}>
            <strong>{item.label}</strong> <span className="badge">{item.action}</span> <span className={item.priority === "high" ? "badge badge-review" : "badge"}>{item.priority}</span>
            <p style={{ margin: "4px 0", color: "#374151", fontSize: 13 }}>{item.reason}</p>
            {item.href && <a href={item.href} style={{ fontSize: 12, color: "#2563eb", fontWeight: 700 }}>추천 위치로 이동 →</a>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function VerifyClaimPage() {
  const [secret, setSecret] = useState("");
  const [adminActor, setAdminActor] = useState("");
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, total_pages: 0 });
  const [claimStats, setClaimStats] = useState<ClaimStats>({ total: 0, needs_review: 0, verified: 0 });
  const [loading, setLoading] = useState(false);

  // Server-side filters
  const [search, setSearch] = useState("");
  const [claimStatusFilter, setClaimStatusFilter] = useState("needs_review");
  const [docStatusFilter, setDocStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    status: "needs_review",
    country: "",
    lang: "",
    category: "",
    slug: "",
    sort: "high_risk",
    stale: "false",
    limit: "50",
    offset: "0",
  });
  const [meta, setMeta] = useState<ClaimListMeta>({ count: 0, limit: 50, offset: 0, has_more: false });

  // Verification form state
  const [selectedClaim, setSelectedClaim] = useState<ClaimRow | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<DocumentRow | null>(null);
  const [wizardStep, setWizardStep] = useState(0);
  const [highRiskConfirmed, setHighRiskConfirmed] = useState(false);
  const [completionLinks, setCompletionLinks] = useState<{ publicUrl: string; apiUrl: string } | null>(null);
  const [claimValue, setClaimValue] = useState("");
  const [sourceType, setSourceType] = useState("official");
  const [sourceAuthority, setSourceAuthority] = useState("official");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [citation, setCitation] = useState("");
  const [confidence, setConfidence] = useState("high");
  const [localFilters, setLocalFilters] = useState({ country: "all", domain: "all", source: "all", confidence: "all", status: "all", stale: "all" });
  const [selectedClaimIds, setSelectedClaimIds] = useState<string[]>([]);
  const [selectedDocCategory, setSelectedDocCategory] = useState<string | null>(null);
  const [highRiskSecondConfirmation, setHighRiskSecondConfirmation] = useState(false);
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
  const [showPolicy, setShowPolicy] = useState(false);
  const [targetSlug, setTargetSlug] = useState<string | null>(null);
  const [targetClaimId, setTargetClaimId] = useState<string | null>(null);
  const [acceptedSuggestions, setAcceptedSuggestions] = useState<SourceCandidate[]>([]);
  const [loadingAcceptedSuggestions, setLoadingAcceptedSuggestions] = useState(false);

  const buildQuery = useCallback((overridePage?: number) => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (claimStatusFilter !== "all") params.set("claim_status", claimStatusFilter);
    if (docStatusFilter !== "all") params.set("doc_status", docStatusFilter);
    params.set("page", String(overridePage ?? page));
    params.set("limit", filters.limit);
    // Also pass through rich filters from the full filter state
    if (filters.country.trim()) params.set("country", filters.country.trim());
    if (filters.lang.trim()) params.set("lang", filters.lang.trim());
    if (filters.category.trim()) params.set("category", filters.category.trim());
    if (filters.slug.trim()) params.set("slug", filters.slug.trim());
    if (targetClaimId) params.set("claim_id", targetClaimId);
    if (filters.sort) params.set("sort", filters.sort);
    if (filters.stale === "true") params.set("stale", "true");
    return params.toString();
  }, [search, claimStatusFilter, docStatusFilter, page, filters, targetClaimId]);

  const load = useCallback(async (overridePage?: number) => {
    if (!secret) return;
    setLoading(true);
    const res = await fetch(`/api/admin/verify-claim?${buildQuery(overridePage)}`, {
      headers: { ...(adminActor.trim() ? { "x-admin-actor": adminActor.trim() } : {}) },
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) {
      setDocuments(Array.isArray(data.documents) ? data.documents : []);
      if (data.pagination) setPagination(data.pagination);
      if (data.claim_stats) setClaimStats(data.claim_stats);
      setMeta({
        count: Number(data.count ?? data.pagination?.total ?? 0),
        limit: Number(data.limit ?? filters.limit),
        offset: Number(data.offset ?? 0),
        has_more: Boolean(data.has_more ?? (data.pagination ? data.pagination.page < data.pagination.total_pages : false)),
      });
    } else {
      setMessage({ ok: false, text: data.error ?? "claim 목록 조회 실패" });
    }
  }, [secret, adminActor, buildQuery, filters.limit]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const slug = params.get("slug");
    const claimId = params.get("claim_id");
    if (slug) {
      setTargetSlug(slug);
      setFilters((current) => ({ ...current, slug, offset: "0", ...(stale ? { stale: "true", status: "verified", sort: "oldest" } : {}) }));
    }
    if (claimId) {
      setTargetClaimId(claimId);
      setClaimStatusFilter("all");
      setFilters((current) => ({ ...current, status: "all", offset: "0" }));
    }
  }, []);

  useEffect(() => {
    if ((!targetSlug && !targetClaimId) || documents.length === 0) return;
    const doc = targetClaimId
      ? documents.find((d) => (d.claims ?? []).some((c) => c.id === targetClaimId))
      : documents.find((d) => d.slug === targetSlug);
    if (!doc) return;
    const el = document.getElementById(`doc-${doc.slug}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    const firstUnverified = (doc.claims ?? []).find((c) => c.status !== "verified");
    if (firstUnverified) openVerify(firstUnverified, doc);
    setTargetSlug(null);
    setTargetClaimId(null);
  }, [targetSlug, targetClaimId, documents]);

  function openVerify(claim: ClaimRow, doc?: DocumentRow) {
    setSelectedClaim(claim);
    setSelectedDocument(doc ?? documents.find((d) => (d.claims ?? []).some((c) => c.id === claim.id)) ?? null);
    setWizardStep(0);
    setHighRiskConfirmed(false);
    setCompletionLinks(null);
    setClaimValue(claim.claim_value === "확인 필요" ? "" : claim.claim_value);
    setTitle("");
    setUrl("");
    setCitation("");
    setSourceType("official");
    setSourceAuthority("official");
    setConfidence("high");
    setSourceCheck(null);
    setAcceptedSuggestions([]);
    loadAcceptedSuggestions(claim.id);
    setMessage(null);
    setTimeout(() => document.getElementById("verify-form")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  async function loadAcceptedSuggestions(claimId: string) {
    if (!secret) return;
    setLoadingAcceptedSuggestions(true);
    try {
      const params = new URLSearchParams({ status: "accepted", claim_id: claimId, limit: "25" });
      const res = await fetch(`/api/admin/source-suggestions?${params.toString()}`, {
        headers: { "x-admin-secret": secret, ...(adminActor.trim() ? { "x-admin-actor": adminActor.trim() } : {}) },
      });
      const data = await res.json();
      setAcceptedSuggestions(res.ok && Array.isArray(data.suggestions) ? data.suggestions : []);
    } finally {
      setLoadingAcceptedSuggestions(false);
    }
  }

  function applyAcceptedSuggestion(source: SourceCandidate) {
    setTitle(source.title ?? "");
    setUrl(source.url ?? "");
    setCitation(source.citation ?? "");
    setSourceType(source.source_type ?? "web");
    setSourceCheck(null);
  }

  async function checkSource() {
    if (!url.trim()) { setMessage({ ok: false, text: "확인할 출처 URL을 입력하세요" }); return; }
    setChecking(true);
    setSourceCheck(null);
    try {
      const res = await fetch("/api/admin/check-source", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-csrf": "1", ...(adminActor.trim() ? { "x-admin-actor": adminActor.trim() } : {}) },
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
      if (!res.ok) setMessage({ ok: false, text: data.error ?? "출처 확인 실패" });
      else setSourceCheck(data);
    } catch (e) {
      setMessage({ ok: false, text: `출처 확인 오류: ${String(e)}` });
    } finally { setChecking(false); }
  }

  async function runClaimAction(action: "verify" | "reject" | "mark_unknown" | "edit_value" | "attach_source" | "promote_document") {
    if (!selectedClaim) return;
    if (action === "verify" && isHighRiskCategory(selectedDocCategory) && !highRiskSecondConfirmation) {
      setMessage({ ok: false, text: "고위험 claim은 second confirmation 체크가 필요합니다." });
      return;
    }
    const res = await fetch("/api/admin/verify-claim", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-csrf": "1", ...(adminActor.trim() ? { "x-admin-actor": adminActor.trim() } : {}) },
      body: JSON.stringify({
        action,
        claim_id: selectedClaim.id,
        claim_value: claimValue,
        source_type: sourceType,
        source_authority: sourceAuthority,
        title, url, citation, confidence,
        second_confirmation: isHighRiskCategory(selectedDocCategory) ? highRiskSecondConfirmation : false,
        observed_at: new Date().toISOString(),
        claim_text: selectedClaim.claim_text,
        fetch_ok: sourceCheck?.reachable ?? null,
        source_check_status: sourceCheck?.source_check_status ?? "unchecked",
        source_trust_score: sourceCheck?.source_trust_score ?? 0,
        source_check_notes: sourceCheck?.source_check_notes ?? [],
        high_risk_confirmed: highRiskConfirmed,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      const doc = selectedDocument;
      if (action === "verify" && doc) {
        setCompletionLinks({ publicUrl: `/${doc.lang ?? "en"}/wiki/${doc.slug}`, apiUrl: `/api/documents/${doc.slug}` });
        setWizardStep(7);
      }
      setMessage({ ok: true, text: data.document_all_verified ? "✓ 검증 저장 완료 — 문서 전체 검증 완료 처리!" : `✓ 액션 저장 완료: ${action}` });
      if (action !== "verify") setSelectedClaim(null);
      await load(page);
    } else {
      setMessage({ ok: false, text: data.error ?? "액션 저장 실패" });
    }
  }

  async function markClaim(action: "needs_verification" | "reject", claim: ClaimRow) {
    const actionReason = window.prompt(action === "reject" ? "Rejected reason" : "Needs-verification reason", reason);
    if (!actionReason?.trim()) return;
    const res = await fetch("/api/admin/verify-claim", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-csrf": "1", ...(adminActor.trim() ? { "x-admin-actor": adminActor.trim() } : {}) },
      body: JSON.stringify({ action, claim_id: claim.id, reason: actionReason.trim() }),
    });
    const data = await res.json();
    if (res.ok) {
      setMessage({ ok: true, text: action === "reject" ? "rejected/disputed 처리 완료" : "needs verification 처리 완료" });
      setReason(actionReason.trim());
      await load(page);
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
      headers: { "Content-Type": "application/json", "x-admin-csrf": "1", ...(adminActor.trim() ? { "x-admin-actor": adminActor.trim() } : {}) },
      body: JSON.stringify({ action: "bulk_needs_verification", claim_ids: selectedClaimIds, reason: reason.trim() }),
    });
    const data = await res.json();
    if (res.ok) {
      setMessage({ ok: true, text: `${selectedClaimIds.length}개 claim을 needs verification으로 처리했습니다` });
      setSelectedClaimIds([]);
      await load(page);
    } else {
      setMessage({ ok: false, text: data.error ?? "bulk 처리 실패" });
    }
  }

  function isStale(claim: ClaimRow) {
    if (claim.status !== "verified" || !claim.last_verified_at) return false;
    return Date.now() - new Date(claim.last_verified_at).getTime() > 180 * 24 * 60 * 60 * 1000;
  }

  async function submitVerify() { return runClaimAction("verify"); }

  const selectedSourceCount = selectedClaim?.claim_sources?.length ?? 0;
  const hasAnySource = selectedSourceCount > 0 || Boolean(title.trim() || url.trim() || citation.trim());
  const selectedIsHighRisk = HIGH_RISK_CATEGORIES.has(String(selectedDocument?.category ?? "").toLowerCase());
  const canVerifySelected = Boolean(selectedClaim && claimValue.trim() && hasAnySource && (!selectedIsHighRisk || highRiskConfirmed));
  const maxWizardStep = selectedIsHighRisk ? 7 : 7;
  function nextWizardStep() {
    setWizardStep((step) => Math.min(maxWizardStep, step + 1));
  }
  function previousWizardStep() {
    setWizardStep((step) => Math.max(0, step - 1));
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    load(1);
  }

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
  const reviewCount = allClaims.filter(({ claim }) => claim.status !== "verified").length;
  const verifiedCount = allClaims.filter(({ claim }) => claim.status === "verified").length;
  const needsReviewCount = documents.reduce((sum, doc) => sum + (doc.claims ?? []).filter((c) => c.status === "needs_review").length, 0);

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "40px 20px" }}>
      <nav style={{ marginBottom: 24, fontSize: 13 }}><Link href="/admin/review">← Admin 운영 콘솔</Link></nav>

      <header className="registry-panel">
        <p className="eyebrow">Admin · 사실 검증 큐</p>
        <h1>사실 검증 관리</h1>
        <p style={{ color: "#6b7280" }}>
          공개 등록된 문서의 사실별 승인 흐름을 관리합니다: 검증 완료, 거절, 알 수 없음, 값 수정, 출처 추가, 전체 검증 완료 시 문서 승격을 처리합니다.
        </p>
        <button
          type="button"
          onClick={() => setShowPolicy((v) => !v)}
          style={{ marginTop: 8, fontSize: 13, color: "#2563eb", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}
        >
          {showPolicy ? "▲ 검증 기준 숨기기" : "▼ 검증 완료 기준 보기"}
        </button>

        {showPolicy && (
          <div style={{ marginTop: 12, padding: 16, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, fontSize: 13 }}>
            <strong style={{ display: "block", marginBottom: 8 }}>사실 검증 완료 기준 (운영 정책)</strong>
            <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
              {POLICY_ITEMS.map((item, i) => <li key={i}>{item}</li>)}
            </ol>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <input value={adminActor} onChange={(e) => setAdminActor(e.target.value)} placeholder="admin actor (email/name; hashed in audit log)" style={{ width: "100%", padding: 8 }} />
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input
            aria-label="Admin secret"
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="ADMIN_SECRET"
            style={{ flex: 1, padding: 10 }}
            onKeyDown={(e) => e.key === "Enter" && load(1)}
          />
          <button onClick={() => { setPage(1); load(1); }} disabled={!secret || loading}>
            {loading ? "불러오는 중..." : "불러오기"}
          </button>
        </div>
      </header>

      {/* Server-side filter section */}
      <section className="registry-panel">
        <h2>필터</h2>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
          <label>상태
            <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value, offset: "0" })}>
              <option value="needs_review">{adminLabel("needs_review")}</option>
              <option value="unknown">알 수 없음</option>
              <option value="disputed">이의/거절</option>
              <option value="verified">{adminLabel("verified")}</option>
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
          <label>stale
            <select value={filters.stale} onChange={(e) => { const stale = e.target.value; setFilters({ ...filters, stale, status: stale === "true" ? "verified" : filters.status, offset: "0" }); if (stale === "true") setClaimStatusFilter("verified"); }}>
              <option value="false">all freshness</option>
              <option value="true">stale verified only</option>
            </select>
          </label>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <button onClick={() => { setPage(1); load(1); }} disabled={!secret || loading}>{loading ? "적용 중..." : "필터 적용"}</button>
          <button type="button" onClick={() => setFilters({ status: "needs_review", country: "", lang: "", category: "", slug: "", sort: "high_risk", stale: "false", limit: "50", offset: "0" })}>초기화</button>
        </div>
      </section>

      {message && (
        <div style={{ padding: 12, marginBottom: 16, borderRadius: 8, background: message.ok ? "#f0fdf4" : "#fef2f2", color: message.ok ? "#166534" : "#991b1b" }}>
          {message.text}
        </div>
      )}

      {/* Claim stats */}
      <div className="stat-strip">
        <div className="stat"><span className="stat-num">{allClaims.length}</span><span className="stat-label">전체 사실 (현재 페이지)</span></div>
        <div className="stat"><span className="stat-num" style={{ color: (claimStats.needs_review || reviewCount) > 0 ? "#b91c1c" : undefined }}>{claimStats.needs_review || reviewCount}</span><span className="stat-label">확인 필요</span></div>
        <div className="stat"><span className="stat-num" style={{ color: "#166534" }}>{claimStats.verified || verifiedCount}</span><span className="stat-label">검증 완료</span></div>
        <div className="stat"><span className="stat-num">{pagination.total || meta.count}</span><span className="stat-label">전체 문서</span></div>
      </div>

      {/* Search + Filter bar */}
      <form onSubmit={handleSearch} className="registry-panel" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ flex: "2 1 200px" }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>문서 검색</label>
          <input
            type="search"
            placeholder="제목 또는 slug로 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%", padding: "8px 10px" }}
          />
        </div>
        <div style={{ flex: "1 1 140px" }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>사실 상태</label>
          <select
            value={claimStatusFilter}
            onChange={(e) => setClaimStatusFilter(e.target.value)}
            style={{ width: "100%", padding: "8px 10px" }}
          >
            <option value="all">전체</option>
            <option value="needs_review">{adminLabel("needs_review")}</option>
            <option value="verified">{adminLabel("verified")}</option>
          </select>
        </div>
        <div style={{ flex: "1 1 140px" }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>문서 상태</label>
          <select
            value={docStatusFilter}
            onChange={(e) => setDocStatusFilter(e.target.value)}
            style={{ width: "100%", padding: "8px 10px" }}
          >
            <option value="all">전체</option>
            <option value="published">published</option>
            <option value="verified">{adminLabel("verified")}</option>
            <option value="needs_review">{adminLabel("needs_review")}</option>
          </select>
        </div>
        <button type="submit" disabled={!secret || loading} style={{ alignSelf: "flex-end", padding: "8px 16px" }}>
          필터 적용
        </button>
      </form>

      {/* Local (client-side) claim filter */}
      <section className="registry-panel">
        <h2>검증 대기 사실 필터 (클라이언트)</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
          <label>country<select value={localFilters.country} onChange={(e) => setLocalFilters({ ...localFilters, country: e.target.value })}><option value="all">all</option>{countries.map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
          <label>domain<select value={localFilters.domain} onChange={(e) => setLocalFilters({ ...localFilters, domain: e.target.value })}><option value="all">all</option>{domains.map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
          <label>source<select value={localFilters.source} onChange={(e) => setLocalFilters({ ...localFilters, source: e.target.value })}><option value="all">all</option><option value="present">present</option><option value="missing">missing</option></select></label>
          <label>confidence<select value={localFilters.confidence} onChange={(e) => setLocalFilters({ ...localFilters, confidence: e.target.value })}><option value="all">all</option><option value="low">low</option><option value="medium">medium</option><option value="high">high</option></select></label>
          <label>상태<select value={localFilters.status} onChange={(e) => setLocalFilters({ ...localFilters, status: e.target.value })}><option value="all">전체</option><option value="needs_review">{adminLabel("needs_review")}</option><option value="verified">{adminLabel("verified")}</option><option value="disputed">이의/거절</option><option value="unknown">알 수 없음</option></select></label>
          <label>{adminLabel("stale")}<select value={localFilters.stale} onChange={(e) => setLocalFilters({ ...localFilters, stale: e.target.value })}><option value="all">전체</option><option value="stale">{adminLabel("stale")}</option><option value="fresh">재검증 불필요</option></select></label>
        </div>
        <p className="meta-label">표시 중: {filteredClaims.length} / {allClaims.length}개 사실 · 일괄 검증 완료는 비활성화되어 있고, 일괄 재검토 요청만 허용됩니다.</p>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="일괄 처리 사유" style={{ flex: 1 }} />
          <button type="button" onClick={bulkNeedsVerification} disabled={selectedClaimIds.length === 0}>선택 사실 재검토 요청 ({selectedClaimIds.length})</button>
          <button type="button" disabled title="위험 방지를 위해 초기 버전에서는 비활성화">일괄 검증 완료 비활성화</button>
        </div>
      </section>

      {/* Document list */}
      {documents.length === 0 && !loading && (
        <div className="registry-panel" style={{ color: "#6b7280", textAlign: "center" }}>
          조건에 맞는 문서가 없습니다.
        </div>
      )}

      {documents.filter((doc) => visibleDocIds.has(doc.id) || localFilters.country === "all" && localFilters.domain === "all" && localFilters.source === "all" && localFilters.confidence === "all" && localFilters.status === "all" && localFilters.stale === "all").map((doc) => {
        if (!visibleDocIds.has(doc.id) && !(localFilters.country === "all" && localFilters.domain === "all" && localFilters.source === "all" && localFilters.confidence === "all" && localFilters.status === "all" && localFilters.stale === "all")) return null;
        const unverifiedCount = (doc.claims ?? []).filter((c) => c.status === "needs_review").length;
        const quality = calculateDocumentQuality({ document: doc, claims: doc.claims ?? [] });
        return (
          <section className="registry-panel" key={doc.id} id={`doc-${doc.slug}`}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
              <div>
                <h2 style={{ margin: 0 }}>
                  <Link href={`/${doc.lang ?? "en"}/wiki/${doc.slug}`} target="_blank" rel="noopener noreferrer">
                    {doc.title}
                  </Link>
                </h2>
                <p className="meta-label" style={{ margin: "4px 0 0" }}>
                  {doc.slug} · {doc.country ?? "?"} · {doc.lang ?? "?"} · {doc.category ?? "?"} · <span className="badge">{doc.status}</span> · <span className="badge">신뢰도: {doc.confidence}</span>
                </p>
                <AdminDbDetails>
                  <p className="meta-label">{adminLabel("entity_id")}: {doc.entity_id ?? "-"}</p>
                </AdminDbDetails>
              </div>
              {unverifiedCount > 0 && (
                <span className="badge badge-review" style={{ whiteSpace: "nowrap" }}>
                  ⚠ 미검증 {unverifiedCount}개
                </span>
              )}
              {unverifiedCount === 0 && (doc.claims ?? []).length > 0 && (
                <span className="badge badge-verified">✓ 전체 검증 완료</span>
              )}
            </div>

            {(doc.claims ?? []).map((claim) => (
              <div className="claim-card" key={claim.id} style={{ borderLeft: claim.status === "verified" ? "3px solid #86efac" : "3px solid #fca5a5" }}>
                <label style={{ float: "right", fontSize: 12 }}><input type="checkbox" checked={selectedClaimIds.includes(claim.id)} onChange={(e) => setSelectedClaimIds((ids) => e.target.checked ? [...ids, claim.id] : ids.filter((id) => id !== claim.id))} /> bulk 선택</label>
                <p className="eyebrow">{adminLabel("field_path")}: {claim.field_path}</p>
                <p><strong>{adminLabel("claim_value")}: {claim.claim_value}</strong></p>
                <p style={{ color: "#6b7280", fontSize: 13 }}>{claim.claim_text}</p>
                <p>
                  <span className={`badge ${claim.status === "verified" ? "badge-verified" : "badge-review"}`}>{adminLabel(claim.status)}</span>{" "}
                  <span className="badge">신뢰도: {claim.confidence}</span>{" "}
                  <span className="badge">출처: {claim.claim_sources?.length ?? 0}</span>
                  {claim.last_verified_at && (
                    <span className="badge badge-verified" style={{ marginLeft: 4 }}>
                      ✓ {new Date(claim.last_verified_at).toLocaleDateString("ko-KR")}
                    </span>
                  )}
                  {isStale(claim) && <span className="badge" style={{ marginLeft: 4 }}>{adminLabel("stale")}</span>}
                </p>
                <AdminDbDetails>
                  <p className="meta-label">{adminLabel("entity_id")}: {doc.entity_id ?? "-"} · {adminLabel("document_id")}: {doc.id}</p>
                  <p className="meta-label">submitter: {claim.submitter ?? claim.contributor_hash ?? "-"} · AI: {[claim.ai_provider, claim.ai_model].filter(Boolean).join(" / ") || "-"}</p>
                </AdminDbDetails>
                {(claim.source_candidates?.length ?? 0) > 0 && (
                  <div><strong>출처 후보</strong><ul>{claim.source_candidates?.map((source, i) => <li key={`${source.url ?? source.title ?? i}`}>{source.source_type ?? "web"} · trust {trustScore(source.source_type, source.url, source.citation)} · {source.url ? <a href={source.url}>{source.title ?? source.url}</a> : (source.title ?? source.citation)}</li>)}</ul></div>
                )}
                {(claim.claim_sources?.length ?? 0) > 0 && (
                  <ul style={{ margin: "4px 0", paddingLeft: 16, fontSize: 13 }}>
                    {claim.claim_sources?.map((source) => (
                      <li key={source.id}>
                        {source.source_type} / {source.source_authority ?? "unknown"} · trust {trustScore(source.source_type, source.url, source.citation)} ·{" "}
                        <a href={source.url ?? "#"} target="_blank" rel="noopener noreferrer">
                          {source.title ?? source.url ?? source.citation ?? source.source_type}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                {(claim.verification_events?.length ?? 0) > 0 && <p className="meta-label">최근 사유: {claim.verification_events?.at(-1)?.note ?? "—"}</p>}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                  {claim.status !== "verified" && <button onClick={() => openVerify(claim, doc)}>출처 추가 + 검증 완료 처리</button>}
                  <button type="button" onClick={() => markClaim("needs_verification", claim)}>재검토 요청 + 사유</button>
                  <button type="button" onClick={() => markClaim("reject", claim)}>거절/이의 처리 + 사유</button>
                </div>
              </div>
            ))}
          </section>
        );
      })}

      {/* Pagination */}
      {pagination.total_pages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, margin: "24px 0", flexWrap: "wrap" }}>
          <button
            onClick={() => { const p = Math.max(1, page - 1); setPage(p); load(p); }}
            disabled={page <= 1 || loading}
          >
            ← 이전
          </button>
          {Array.from({ length: Math.min(7, pagination.total_pages) }, (_, i) => {
            const p = Math.max(1, Math.min(pagination.total_pages - 6, page - 3)) + i;
            return (
              <button
                key={p}
                onClick={() => { setPage(p); load(p); }}
                disabled={loading}
                style={{ fontWeight: p === page ? 800 : 400, background: p === page ? "#2563eb" : undefined, color: p === page ? "#fff" : undefined }}
              >
                {p}
              </button>
            );
          })}
          <button
            onClick={() => { const p = Math.min(pagination.total_pages, page + 1); setPage(p); load(p); }}
            disabled={page >= pagination.total_pages || loading}
          >
            다음 →
          </button>
          <span style={{ alignSelf: "center", fontSize: 13, color: "#6b7280" }}>
            {page} / {pagination.total_pages} 페이지 · 전체 {pagination.total}건
          </span>
        </div>
      )}

      {/* Verification form */}
      {selectedClaim && (
        <section id="verify-form" className="registry-panel" style={{ borderColor: "#2563eb", borderWidth: 2 }}>
          <h2>사실 검증 Wizard · {selectedClaim.field_path}</h2>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", marginBottom: 16 }}>
            {WIZARD_STEPS.map((step, index) => (
              <button
                key={step}
                type="button"
                onClick={() => setWizardStep(index)}
                disabled={index >= 6 && !hasAnySource}
                style={{
                  padding: 8,
                  border: index === wizardStep ? "2px solid #2563eb" : "1px solid #d1d5db",
                  background: index === wizardStep ? "#eff6ff" : index < wizardStep ? "#f0fdf4" : "#fff",
                  color: index >= 6 && !hasAnySource ? "#9ca3af" : undefined,
                }}
              >
                {index + 1}. {step}
              </button>
            ))}
          </div>
          <div style={{ padding: 14, borderRadius: 10, background: "#f8fafc", border: "1px solid #e5e7eb", marginBottom: 16 }}>
            <strong>{WIZARD_STEPS[wizardStep]}</strong>
            <p style={{ margin: "6px 0 0", color: "#4b5563" }}>{STEP_HELP[wizardStep]}</p>
            {selectedDocument && (
              <p className="meta-label" style={{ margin: "8px 0 0" }}>
                대상: {selectedDocument.title} · category: {selectedDocument.category ?? "?"}
              </p>
            )}
            {!hasAnySource && wizardStep >= 2 && (
              <p style={{ margin: "8px 0 0", color: "#b91c1c", fontWeight: 700 }}>출처가 없으므로 verified 처리 단계로 이동할 수 없습니다.</p>
            )}
            {selectedIsHighRisk && (
              <p style={{ margin: "8px 0 0", color: "#92400e", fontWeight: 700 }}>High-risk category: 추가 확인 체크가 필요합니다.</p>
            )}
          </div>
          <div className="claim-card" style={{ marginBottom: 16, background: "#f0f9ff" }}>
            <p className="eyebrow">현재 값</p>
            <p><strong>{selectedClaim.claim_value}</strong></p>
            <p style={{ fontSize: 13, color: "#6b7280" }}>{selectedClaim.claim_text}</p>
          </div>

          {loadingAcceptedSuggestions && <p className="meta-label">accepted source suggestions 불러오는 중...</p>}
          {acceptedSuggestions.length > 0 && (
            <div style={{ padding: 12, border: "1px solid #bfdbfe", borderRadius: 8, marginBottom: 12, background: "#eff6ff" }}>
              <strong>Accepted source suggestions</strong>
              <p className="meta-label">운영자가 accepted 처리한 출처입니다. 선택하면 아래 source 입력란에 채워지고, verify/attach source 저장 시 claim_sources로 사용할 수 있습니다.</p>
              <ul style={{ margin: "8px 0 0", paddingLeft: 16 }}>
                {acceptedSuggestions.map((source, i) => (
                  <li key={source.id ?? `${source.url ?? source.title ?? i}`}>
                    {source.source_type ?? "web"} · {source.url ? <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title ?? source.url}</a> : (source.title ?? source.citation)}
                    <button type="button" onClick={() => applyAcceptedSuggestion(source)} style={{ marginLeft: 8 }}>이 출처 사용</button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <label style={{ display: "block", marginBottom: 12 }}>
            <span style={{ fontWeight: 600 }}>검증된 값 *</span>
            <input
              value={claimValue}
              onChange={(e) => setClaimValue(e.target.value)}
              placeholder="실제 확인된 값을 입력하세요"
              style={{ display: "block", width: "100%", marginTop: 4, padding: 8 }}
            />
          </label>

          <label style={{ display: "block", marginBottom: 12 }}>
            <span style={{ fontWeight: 600 }}>출처 종류</span>
            <select
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value)}
              style={{ display: "block", width: "100%", marginTop: 4, padding: 8 }}
            >
              {SOURCE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>

          <label style={{ display: "block", marginBottom: 12 }}>
            <span style={{ fontWeight: 600 }}>source_authority</span>
            <select
              value={sourceAuthority}
              onChange={(e) => setSourceAuthority(e.target.value)}
              style={{ display: "block", width: "100%", marginTop: 4, padding: 8 }}
            >
              <option value="official">official</option>
              <option value="regulator">regulator</option>
              <option value="primary">primary</option>
              <option value="legal">legal</option>
              <option value="platform">platform</option>
              <option value="secondary">secondary</option>
              <option value="community">community</option>
              <option value="unknown">unknown</option>
            </select>
          </label>

          <label style={{ display: "block", marginBottom: 12 }}>
            <span style={{ fontWeight: 600 }}>출처 제목</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="공식 페이지명, 기사 제목 등"
              style={{ display: "block", width: "100%", marginTop: 4, padding: 8 }}
            />
          </label>

          <label style={{ display: "block", marginBottom: 4 }}>
            <span style={{ fontWeight: 600 }}>출처 URL</span>
          </label>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input
              value={url}
              onChange={(e) => { setUrl(e.target.value); setSourceCheck(null); }}
              placeholder="https://..."
              style={{ flex: 1, padding: 8 }}
            />
            <button type="button" onClick={checkSource} disabled={checking || !url.trim()}>
              {checking ? "확인 중..." : "출처 확인"}
            </button>
            {url.trim() && <a href={url.trim()} target="_blank" rel="noopener noreferrer" style={{ alignSelf: "center" }}>새 탭에서 열기</a>}
          </div>

          {sourceCheck && (
            <div style={{ padding: 12, borderRadius: 8, fontSize: 13, marginBottom: 12, background: sourceCheck.reachable ? "#f0fdf4" : "#fef2f2", border: `1px solid ${sourceCheck.reachable ? "#86efac" : "#fecaca"}` }}>
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
              <p style={{ margin: "6px 0 0", fontSize: 11, color: "#6b7280" }}>Source check/trust score는 보조 신호입니다 — 통과해도 검증 완료가 아니며 반드시 관리자 승인 후 저장하세요. 자동 매칭은 보조 수단입니다. 반드시 직접 확인 후 저장하세요.</p>
            </div>
          )}

          <label style={{ display: "block", marginBottom: 12 }}>
            <span style={{ fontWeight: 600 }}>citation / 메모</span>
            <textarea
              value={citation}
              onChange={(e) => setCitation(e.target.value)}
              placeholder="어떤 문구·수치를 확인했는지 기록 (예: '영업시간 09:00–18:00' 명시)"
              style={{ display: "block", width: "100%", marginTop: 4, padding: 8, minHeight: 80 }}
            />
          </label>

          <label style={{ display: "block", marginBottom: 16 }}>
            <span style={{ fontWeight: 600 }}>confidence</span>
            <select
              value={confidence}
              onChange={(e) => setConfidence(e.target.value)}
              style={{ display: "block", marginTop: 4, padding: 8 }}
            >
              <option value="high">high — 공식/법령/공식 플랫폼</option>
              <option value="medium">medium — 신뢰 가능한 3자 출처</option>
            </select>
          </label>

          {selectedIsHighRisk && (
            <label style={{ display: "block", marginBottom: 16, padding: 12, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8 }}>
              <input type="checkbox" checked={highRiskConfirmed} onChange={(e) => setHighRiskConfirmed(e.target.checked)} />{" "}
              고위험 카테고리 claim임을 확인했고, 출처·값·confidence를 한 번 더 대조했습니다.
            </label>
          )}

          {completionLinks && (
            <div style={{ padding: 14, borderRadius: 10, background: "#f0fdf4", border: "1px solid #86efac", marginBottom: 16 }}>
              <strong>검증 완료 후 확인 링크</strong>
              <p>Public URL: <Link href={completionLinks.publicUrl} target="_blank">{completionLinks.publicUrl}</Link></p>
              <p>API URL: <Link href={completionLinks.apiUrl} target="_blank">{completionLinks.apiUrl}</Link></p>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <button type="button" onClick={previousWizardStep} disabled={wizardStep === 0}>이전 단계</button>
            <button type="button" onClick={nextWizardStep} disabled={wizardStep >= maxWizardStep || (wizardStep >= 5 && !hasAnySource)}>다음 단계</button>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={submitVerify} disabled={!canVerifySelected}>1. 사실 검증 완료로 저장</button>
            <button onClick={() => runClaimAction("reject")} type="button">2. 사실 거절</button>
            <button onClick={() => runClaimAction("mark_unknown")} type="button">3. 알 수 없음으로 표시</button>
            <button onClick={() => runClaimAction("edit_value")} type="button">4. 검증할 값 수정</button>
            <button onClick={() => runClaimAction("attach_source")} type="button">5. 출처만 추가</button>
            <button onClick={() => runClaimAction("promote_document")} type="button">6. 모든 필수 사실 검증 완료 시 문서 승격</button>
            <button onClick={() => setSelectedClaim(null)} type="button" style={{ background: "none", border: "1px solid #d1d5db" }}>취소</button>
          </div>
        </section>
      )}
    </div>
  );
}
