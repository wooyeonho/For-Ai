import type { Metadata } from "next";
import Link from "next/link";
import { getAllRegistryBundles } from "../../../lib/data";
import type { ClaimWithSources, RegistryDocumentBundle } from "../../../lib/types";

export const metadata: Metadata = {
  title: "Claim 검증 관리",
  description: "GYEOL 레지스트리의 claim을 검증 상태별로 관리합니다.",
};

function confidenceBadgeClass(c: string): string {
  if (c === "high") return "badge badge-high";
  if (c === "medium") return "badge badge-medium";
  return "badge badge-low";
}

function statusBadgeClass(s: string): string {
  if (s === "verified") return "badge badge-verified";
  if (s === "disputed") return "badge badge-disputed";
  if (s === "needs_review") return "badge badge-review";
  return "badge badge-low";
}

function statusLabel(s: string): string {
  if (s === "verified") return "검증됨";
  if (s === "disputed") return "이의 제기";
  if (s === "needs_review") return "확인 필요";
  return s;
}

function confidenceLabel(c: string): string {
  if (c === "high") return "높음";
  if (c === "medium") return "보통";
  return "낮음";
}

type ClaimRow = ClaimWithSources & {
  documentSlug: string;
  documentTitle: string;
  entityName: string;
};

export default function VerifyClaimPage() {
  const bundles = getAllRegistryBundles();

  const allClaims: ClaimRow[] = bundles.flatMap((b: RegistryDocumentBundle) =>
    b.claims.map((c: ClaimWithSources) => ({
      ...c,
      documentSlug: b.document.slug,
      documentTitle: b.document.title,
      entityName: b.entity.canonical_name,
    })),
  );

  const needsReview = allClaims.filter((c) => c.status === "needs_review");
  const verified = allClaims.filter((c) => c.status === "verified");
  const disputed = allClaims.filter((c) => c.status === "disputed");

  const totalCount = allClaims.length;
  const verifiedCount = verified.length;
  const reviewCount = needsReview.length;
  const disputedCount = disputed.length;
  const verifiedPct = totalCount ? Math.round((verifiedCount / totalCount) * 100) : 0;

  const groupByDocument = (claims: ClaimRow[]): Map<string, ClaimRow[]> => {
    const map = new Map<string, ClaimRow[]>();
    for (const c of claims) {
      const key = c.documentSlug;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return map;
  };

  const reviewGroups = groupByDocument(needsReview);
  const verifiedGroups = groupByDocument(verified);

  return (
    <article>
      <header className="registry-panel">
        <p className="eyebrow">Admin / Claim 검증 관리</p>
        <h1>Claim 검증 대시보드</h1>
        <p style={{ color: "var(--muted)", fontSize: "0.9rem", margin: "0 0 16px" }}>
          전체 claim의 검증 상태를 한눈에 파악하고, 확인 필요 claim을 우선 처리합니다.
        </p>

        <div className="stat-strip" style={{ marginBottom: 0 }}>
          <div className="stat">
            <span className="stat-num">{totalCount}</span>
            <span className="stat-label">전체 claim</span>
          </div>
          <div className="stat">
            <span className="stat-num" style={{ color: "var(--success)" }}>{verifiedCount}</span>
            <span className="stat-label">검증됨</span>
          </div>
          <div className="stat">
            <span className="stat-num" style={{ color: "var(--warning)" }}>{reviewCount}</span>
            <span className="stat-label">확인 필요</span>
          </div>
          <div className="stat">
            <span className="stat-num" style={{ color: "var(--danger)" }}>{disputedCount}</span>
            <span className="stat-label">이의 제기</span>
          </div>
          <p className="stat-note">
            검증률 {verifiedPct}% — 검증된 claim만 AI 인용이 허용됩니다.
          </p>
        </div>
      </header>

      {reviewCount > 0 && (
        <section className="registry-panel" aria-labelledby="needs-review-section">
          <h2 id="needs-review-section" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            확인 필요
            <span className="claim-count" style={{ background: "var(--warning-bg)", color: "var(--warning)", borderColor: "#e4c36b" }}>
              {reviewCount}
            </span>
          </h2>
          <p style={{ color: "var(--muted)", fontSize: "0.85rem", margin: "0 0 16px" }}>
            아래 claim들은 출처 확인 후 검증 상태로 전환이 필요합니다.
          </p>

          {Array.from(reviewGroups.entries()).map(([slug, claims]) => (
            <div key={slug} style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <Link
                  href={`/ko/wiki/${slug}`}
                  style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--accent)" }}
                >
                  {claims[0].documentTitle}
                </Link>
                <span className="badge" style={{ fontSize: "0.7rem" }}>{claims[0].entityName}</span>
              </div>

              <div className="claim-list">
                {claims.map((claim) => (
                  <div className="claim-card" key={claim.id}>
                    <div className="claim-card-header">
                      <div>
                        <p className="eyebrow" style={{ margin: "0 0 4px" }}>{claim.field_path}</p>
                        <p className="claim-value">{claim.claim_value}</p>
                      </div>
                      <div className="claim-badges">
                        <span className={statusBadgeClass(claim.status)}>
                          {statusLabel(claim.status)}
                        </span>
                        <span className={confidenceBadgeClass(claim.confidence)}>
                          {confidenceLabel(claim.confidence)}
                        </span>
                      </div>
                    </div>
                    <p className="claim-text">{claim.claim_text}</p>

                    {claim.sources.length > 0 ? (
                      <div className="claim-sources">
                        {claim.sources.map((src) => (
                          <a
                            key={src.id}
                            href={src.url ?? "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="source-pill"
                          >
                            <span className="source-type">{src.source_type}</span>
                            {src.title ?? src.url ?? "출처"}
                          </a>
                        ))}
                      </div>
                    ) : (
                      <p style={{ fontSize: "0.82rem", color: "var(--danger)", margin: "0 0 8px" }}>
                        출처 없음 — 검증하려면 먼저 출처를 추가하세요
                      </p>
                    )}

                    <div className="cta-row" style={{ marginTop: 8 }}>
                      <Link
                        href={`/ko/wiki/${claim.documentSlug}`}
                        className="cta-link"
                        style={{ fontSize: "0.8rem" }}
                      >
                        문서 보기
                      </Link>
                      <Link
                        href={`/report/${claim.documentSlug}`}
                        className="cta-link cta-correction"
                        style={{ fontSize: "0.8rem" }}
                      >
                        정정 제보
                      </Link>
                      <Link
                        href={`/diagnostics/${claim.documentSlug}`}
                        className="cta-link"
                        style={{ fontSize: "0.8rem" }}
                      >
                        진단
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {verifiedCount > 0 && (
        <section className="registry-panel" aria-labelledby="verified-section">
          <h2 id="verified-section" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            검증 완료
            <span className="claim-count" style={{ background: "var(--success-bg)", color: "var(--success)", borderColor: "#7bc47f" }}>
              {verifiedCount}
            </span>
          </h2>

          {Array.from(verifiedGroups.entries()).map(([slug, claims]) => (
            <div key={slug} style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <Link
                  href={`/ko/wiki/${slug}`}
                  style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--accent)" }}
                >
                  {claims[0].documentTitle}
                </Link>
                <span className="badge" style={{ fontSize: "0.7rem" }}>{claims[0].entityName}</span>
              </div>

              <div className="claim-list">
                {claims.map((claim) => (
                  <div className="claim-card" key={claim.id} style={{ borderColor: "#7bc47f" }}>
                    <div className="claim-card-header">
                      <div>
                        <p className="eyebrow" style={{ margin: "0 0 4px" }}>{claim.field_path}</p>
                        <p className="claim-value">{claim.claim_value}</p>
                      </div>
                      <div className="claim-badges">
                        <span className={statusBadgeClass(claim.status)}>
                          {statusLabel(claim.status)}
                        </span>
                        <span className={confidenceBadgeClass(claim.confidence)}>
                          {confidenceLabel(claim.confidence)}
                        </span>
                      </div>
                    </div>
                    <p className="claim-text">{claim.claim_text}</p>

                    {claim.sources.length > 0 && (
                      <div className="claim-sources">
                        {claim.sources.map((src) => (
                          <a
                            key={src.id}
                            href={src.url ?? "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="source-pill"
                          >
                            <span className="source-type">{src.source_type}</span>
                            {src.title ?? src.url ?? "출처"}
                          </a>
                        ))}
                      </div>
                    )}

                    {claim.last_verified_at && (
                      <div className="verification-meta">
                        <span className="meta-label">최종 검증</span>
                        <span className="verification-value">{claim.last_verified_at}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      <nav className="registry-panel" aria-labelledby="admin-links">
        <h2 id="admin-links">관리 도구</h2>
        <ul className="link-list">
          <li><Link href="/admin/review">전체 리뷰 큐</Link></li>
          <li><Link href="/admin/candidates">후보 검토 큐</Link></li>
          <li><Link href="/admin/generate">후보 자동 생성</Link></li>
          <li><Link href="/admin/new-entity">새 엔티티 생성</Link></li>
          <li><Link href="/admin/new-document">새 문서 생성</Link></li>
          <li><Link href="/admin/import">대량 가져오기</Link></li>
        </ul>
      </nav>
    </article>
  );
}
