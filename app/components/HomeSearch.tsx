"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export interface HomeSearchDoc {
  slug: string;
  title: string;
  category: string;
  status: string;
  confidence: string;
  sourceCount: number;
  lastVerifiedAt: string | null;
  source: "static" | "supabase";
  lang?: string;
}

function citationBadge(status: string) {
  if (status === "verified" || status === "published") {
    return <span className="badge badge-verified">인용 가능</span>;
  }
  if (status === "needs_review") {
    return <span className="badge badge-review">확인 필요 / 사실값 인용 금지</span>;
  }
  return <span className="badge badge-low">사실값 인용 금지</span>;
}

export default function HomeSearch({
  docs,
  locale = "ko",
}: {
  docs: HomeSearchDoc[];
  locale?: string;
}) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!normalizedQuery) return docs;
    return docs.filter((d) =>
      [d.title, d.slug, d.category, d.status, d.confidence]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [docs, normalizedQuery]);

  return (
    <div className="registry-search" role="search" aria-labelledby="registry-search-title">
      <p className="section-eyebrow">문서 검색</p>
      <h2 className="section-title" id="registry-search-title">
        일반 사용자 문서 찾기
      </h2>
      <label className="sr-only" htmlFor="home-document-search">
        title, slug, status, confidence, category로 문서 검색
      </label>
      <input
        id="home-document-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="title, slug, status, confidence, category로 검색…"
        style={{
          width: "100%",
          padding: "10px 14px",
          border: "1px solid #d1d5db",
          borderRadius: 8,
          fontSize: 15,
          outline: "none",
          boxSizing: "border-box",
          marginBottom: 20,
        }}
      />
      {filtered.length === 0 ? (
        <p style={{ color: "#6b7280" }}>
          &quot;{query}&quot; 검색 결과가 없습니다.{" "}
          <button
            onClick={() => setQuery("")}
            style={{
              background: "none",
              border: "none",
              color: "#2563eb",
              cursor: "pointer",
              fontSize: 14,
              padding: 0,
            }}
          >
            초기화
          </button>
        </p>
      ) : (
        <ul className="registry-index" aria-label="검색 결과">
          {filtered.map((d) => (
            <li key={`${d.source}-${d.slug}`} className="registry-row">
              <div className="registry-row-main">
                <Link href={`/${d.lang ?? locale}/wiki/${d.slug}`} className="registry-row-title">
                  {d.title}
                </Link>
                <span className="registry-row-entity">
                  slug: {d.slug} · status: {d.status} · confidence: {d.confidence} · sources:{" "}
                  {d.sourceCount}
                </span>
              </div>
              <div className="registry-row-meta">
                {citationBadge(d.status)}
                {d.category ? <span className="badge">{d.category}</span> : null}
                {d.source === "supabase" ? <span className="badge">new</span> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
