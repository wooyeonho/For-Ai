"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Confidence, DocumentStatus } from "../../lib/types";

interface DocItem {
  slug: string;
  title: string;
  category?: string;
  source: "static" | "supabase";
  lang?: string;
  status: DocumentStatus;
  confidence: Confidence;
  sourceCount: number;
}

function citationLabel(doc: DocItem): { className: string; label: string } {
  if ((doc.status === "verified" || doc.status === "published") && doc.confidence !== "low") {
    return { className: "badge badge-verified", label: "인용 가능" };
  }
  return { className: "badge badge-review", label: "사실값 인용 금지" };
}

export default function HomeSearch({ docs, locale = "ko" }: { docs: DocItem[]; locale?: string }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return docs;
    return docs.filter(
      (d) =>
        d.title.toLowerCase().includes(normalized) ||
        d.slug.toLowerCase().includes(normalized) ||
        (d.category ?? "").toLowerCase().includes(normalized) ||
        d.status.toLowerCase().includes(normalized) ||
        d.confidence.toLowerCase().includes(normalized),
    );
  }, [docs, query]);

  return (
    <>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="제목, slug, 카테고리, status, confidence로 검색..."
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
        <div>
          {query ? (
            <p style={{ color: "#6b7280" }}>
              &quot;{query}&quot; — 검색 결과가 없습니다.{" "}
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
            <p style={{ color: "#9ca3af" }}>
              아직 공개 문서가 없습니다. <Link href="/suggest-topic">첫 토픽 제안하기 →</Link>
            </p>
          )}
        </div>
      ) : (
        <>
          <h3 className="search-results-heading">
            검색 결과 ({filtered.length}
            {query ? ` / ${docs.length}` : ""})
          </h3>
          <ul className="document-list">
            {filtered.map((d) => {
              const cite = citationLabel(d);
              return (
                <li key={`${d.source}-${d.slug}`}>
                  <div className="document-list-main">
                    <Link href={`/${d.lang ?? locale}/wiki/${d.slug}`}>{d.title}</Link>
                    <span className="meta-label">/{d.slug}</span>
                  </div>
                  <div className="document-list-meta">
                    {d.category ? <span className="badge">{d.category}</span> : null}
                    <span className="badge">confidence: {d.confidence}</span>
                    <span className="badge">status: {d.status}</span>
                    <span className="badge">sources: {d.sourceCount}</span>
                    <span className={cite.className}>{cite.label}</span>
                    {d.source === "supabase" ? <span className="badge badge-medium">new</span> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
