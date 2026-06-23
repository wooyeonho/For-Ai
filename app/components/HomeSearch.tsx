"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Confidence, DocumentStatus } from "../../lib/types";

export interface HomeSearchDoc {
  slug: string;
  title: string;
  category?: string;
  status: DocumentStatus;
  confidence: Confidence;
  sourceCount: number;
  source: "static" | "supabase";
  lang?: string;
}

function statusLabel(status: DocumentStatus): string {
  if (status === "verified" || status === "published") return "검증 완료";
  if (status === "needs_review") return "확인 필요";
  if (status === "archived") return "보관";
  return "초안";
}

function statusClassName(status: DocumentStatus): string {
  if (status === "verified" || status === "published") return "badge badge-verified";
  if (status === "needs_review") return "badge badge-review";
  if (status === "archived") return "badge";
  return "badge badge-low";
}

function citationBadge(doc: HomeSearchDoc) {
  if (doc.status === "verified" || doc.status === "published") {
    return <span className="badge badge-verified">인용 가능</span>;
  }
  if (doc.status === "needs_review") {
    return <span className="badge badge-review">확인 필요 / 사실값 인용 금지</span>;
  }
  return null;
}

export default function HomeSearch({ docs, locale = "ko" }: { docs: HomeSearchDoc[]; locale?: string }) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      normalizedQuery
        ? docs.filter((d) =>
            [d.title, d.slug, d.status, d.confidence, d.category ?? ""]
              .join(" ")
              .toLowerCase()
              .includes(normalizedQuery),
          )
        : docs,
    [docs, normalizedQuery],
  );

  return (
    <div className="home-search" id="search">
      <label className="home-search-label" htmlFor="home-registry-search">
        문서 검색
      </label>
      <input
        id="home-registry-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="title, slug, status, confidence, category로 검색..."
        className="home-search-input"
      />
      {filtered.length === 0 ? (
        <div className="home-search-empty">
          {query ? (
            <p>
              &quot;{query}&quot; 검색 결과가 없습니다. {" "}
              <button type="button" onClick={() => setQuery("")}>
                검색 초기화
              </button>
            </p>
          ) : (
            <p>
              등록된 문서가 없습니다. <Link href="/suggest-topic">첫 토픽 제안하기 →</Link>
            </p>
          )}
        </div>
      ) : (
        <>
          <p className="home-search-count">
            검색 결과 {filtered.length}건{query ? ` / 전체 ${docs.length}건` : ""}
          </p>
          <ul className="document-list home-search-results">
            {filtered.map((d) => (
              <li key={d.slug}>
                <div className="home-search-result-main">
                  <Link href={`/${locale}/wiki/${d.slug}`}>{d.title}</Link>
                  <span className="mono-link">/{locale}/wiki/{d.slug}</span>
                </div>
                <div className="home-search-result-meta">
                  <span className={statusClassName(d.status)}>{statusLabel(d.status)}</span>
                  <span className="badge">confidence: {d.confidence}</span>
                  <span className="badge">sources: {d.sourceCount}</span>
                  {d.category ? <span className="badge">{d.category}</span> : null}
                  {citationBadge(d)}
                  {d.source === "supabase" ? <span className="badge badge-medium">new</span> : null}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
