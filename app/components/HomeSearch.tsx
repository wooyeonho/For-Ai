"use client";
import Link from "next/link";
import { useState } from "react";
import { getTranslations } from "../../lib/i18n";
import type { SupportedLocale } from "../../lib/i18n";

interface DocItem {
  slug: string;
  title: string;
  category?: string;
  summary?: string;
  source: "static" | "supabase";
  lang?: string;
}

export default function HomeSearch({ docs, locale = "ko" }: { docs: DocItem[]; locale?: string }) {
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
        style={{
          width: "100%",
          padding: "10px 14px",
          border: "1px solid var(--line)",
          borderRadius: 8,
          fontSize: 15,
          outline: "none",
          boxSizing: "border-box",
          marginBottom: 20,
          background: "var(--panel)",
          color: "var(--text)",
        }}
      />
      {filtered.length === 0 ? (
        <div>
          {query ? (
            <p style={{ color: "var(--muted)" }}>
              &quot;{query}&quot; — {t.home.noResults}.{" "}
              <Link
                href={`/suggest-topic?q=${encodeURIComponent(query)}`}
                style={{ color: "var(--accent)" }}
              >
                {t.home.suggestFirst}
              </Link>{" "}
              <button
                onClick={() => setQuery("")}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--muted)",
                  cursor: "pointer",
                  fontSize: 14,
                  padding: 0,
                  marginLeft: 8,
                  minHeight: "auto",
                }}
              >
                {t.home.resetSearch}
              </button>
            </p>
          ) : (
            <p style={{ color: "var(--muted)" }}>
              {t.home.noDocs}{" "}
              <Link href="/suggest-topic" style={{ color: "var(--accent)" }}>
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
                  <span
                    style={{
                      fontSize: 10,
                      marginLeft: 6,
                      padding: "1px 6px",
                      background: "#f3e8ff",
                      color: "#7e22ce",
                      borderRadius: 10,
                    }}
                  >
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
