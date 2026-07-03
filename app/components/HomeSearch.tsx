"use client";
import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { getTranslations } from "../../lib/i18n";
import type { SupportedLocale } from "../../lib/i18n";
import type { SearchResult } from "../api/search/route";

interface DocItem {
  slug: string;
  title: string;
  category?: string;
  summary?: string;
  source: "static" | "supabase";
  lang?: string;
}

export default function HomeSearch({ docs, locale }: { docs: DocItem[]; locale: SupportedLocale }) {
  const [query, setQuery] = useState("");
  const [apiResults, setApiResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const t = getTranslations(locale);

  const q = query.trim().toLowerCase();

  const localFiltered = q
    ? docs.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          (d.category ?? "").toLowerCase().includes(q) ||
          (d.summary ?? "").toLowerCase().includes(q),
      )
    : docs;

  useEffect(() => {
    if (!q || q.length < 2) {
      setApiResults([]);
      setSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setSearching(true);
      try {
        const params = new URLSearchParams({ q, lang: locale, limit: "15" });
        const res = await fetch(`/api/search?${params}`, { signal: controller.signal });
        if (!res.ok) throw new Error("search failed");
        const data = await res.json();
        if (!controller.signal.aborted) {
          setApiResults(Array.isArray(data.results) ? data.results : []);
        }
      } catch {
        if (!controller.signal.aborted) setApiResults([]);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [q, locale]);

  // Merge: API results first (ranked by server), then local matches not already in API results
  const apiSlugs = new Set(apiResults.map((r) => r.slug));
  const localExtra = localFiltered.filter((d) => !apiSlugs.has(d.slug));
  const merged = q ? [...apiResults, ...localExtra] : localFiltered;

  return (
    <>
      <div style={{ position: "relative" }}>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.home.searchPlaceholder}
          className="home-search-input"
        />
        {searching && (
          <span
            aria-label="검색 중"
            style={{
              position: "absolute",
              right: 12,
              top: "50%",
              transform: "translateY(-50%)",
              fontSize: "0.75rem",
              color: "var(--muted)",
              fontFamily: "var(--font-mono)",
            }}
          >
            ...
          </span>
        )}
      </div>

      {merged.length === 0 ? (
        <div>
          {query ? (
            <div className="home-search-empty">
              <p className="home-search-muted">
                &quot;{query}&quot; — {t.home.noResults}. If For-Ai does not have this answer yet, send it for review.
              </p>
              <div className="home-search-empty-actions">
                <Link href={suggestHref} className="btn btn-primary">
                  이 질문을 For-Ai에 등록하기
                </Link>
                <button
                  onClick={() => setQuery("")}
                  className="home-search-reset"
                >
                  {t.home.resetSearch}
                </button>
              </div>
            </div>
          ) : (
            <p className="home-search-muted">
              {t.home.noDocs}{" "}
              <Link href={suggestHref} className="home-search-link">
                {t.home.suggestFirst}
              </Link>
            </p>
          )}
        </div>
      ) : (
        <>
          <h2>
            {t.home.registeredDocs} ({merged.length}
            {query ? ` / ${docs.length}` : ""})
          </h2>
          <ul className="document-list">
            {merged.map((item) => {
              if ("type" in item) {
                // API result
                const r = item as SearchResult;
                return (
                  <li key={r.slug}>
                    <Link href={`/${locale}/wiki/${r.slug}`}>{r.title}</Link>
                    {r.category && <span className="meta-label"> — {r.category}</span>}
                    {r.excerpt && (
                      <span className="home-source-badge" title={r.excerpt}>
                        {r.type === "claim" ? "클레임 매치" : ""}
                      </span>
                    )}
                  </li>
                );
              }
              // Local result
              const d = item as DocItem;
              return (
                <li key={d.slug}>
                  <Link href={`/${locale}/wiki/${d.slug}`}>{d.title}</Link>
                  {d.category && <span className="meta-label"> — {d.category}</span>}
                  {d.source === "supabase" && (
                    <span className="home-source-badge">new</span>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
