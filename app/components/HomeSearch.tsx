"use client";
import Link from "next/link";
import { useState } from "react";
import { DEFAULT_LOCALE, getTranslations } from "../../lib/i18n";
import type { SupportedLocale } from "../../lib/i18n";

interface DocItem {
  slug: string;
  title: string;
  category?: string;
  summary?: string;
  source: "static" | "supabase";
  lang?: string;
}

export default function HomeSearch({ docs, locale = DEFAULT_LOCALE }: { docs: DocItem[]; locale?: string }) {
  const [query, setQuery] = useState("");
  const t = getTranslations(locale as SupportedLocale);
  const q = query.trim().toLowerCase();
  const filtered = q
    ? docs.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          (d.category ?? "").toLowerCase().includes(q) ||
          (d.summary ?? "").toLowerCase().includes(q),
      )
    : docs;

  return (
    <>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t.home.searchPlaceholder}
        className="home-search-input"
      />
      {filtered.length === 0 ? (
        <div>
          {query ? (
            <p className="home-search-muted">
              &quot;{query}&quot; — {t.home.noResults}.{" "}
              <Link
                href={`/suggest-topic?q=${encodeURIComponent(query)}`}
                className="home-search-link"
              >
                {t.home.suggestFirst}
              </Link>{" "}
              <button
                onClick={() => setQuery("")}
                className="home-search-reset"
              >
                {t.home.resetSearch}
              </button>
            </p>
          ) : (
            <p className="home-search-muted">
              {t.home.noDocs}{" "}
              <Link href="/suggest-topic" className="home-search-link">
                {t.home.suggestFirst}
              </Link>
            </p>
          )}
        </div>
      ) : (
        <>
          <h2>
            {t.home.registeredDocs} ({filtered.length}
            {query ? ` / ${docs.length}` : ""})
          </h2>
          <ul className="document-list">
            {filtered.map((d) => (
              <li key={d.slug}>
                <Link href={`/${locale}/wiki/${d.slug}`}>{d.title}</Link>
                {d.category && <span className="meta-label"> — {d.category}</span>}
                {d.source === "supabase" && (
                  <span className="home-source-badge">
                    new
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
