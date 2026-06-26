"use client";
import Link from "next/link";
import { useRef, useState } from "react";
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
  const resultsRef = useRef<HTMLDivElement>(null);
  const firstResultRef = useRef<HTMLAnchorElement>(null);
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

  const executeSearch = () => {
    if (firstResultRef.current) {
      firstResultRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      firstResultRef.current.focus({ preventScroll: true });
      return;
    }

    resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section className="truth-command-panel" aria-label="Truth Engine search">
      <div className="truth-command-header">
        <span className="truth-command-kicker">Truth Engine</span>
        <span className="truth-command-status">
          {filtered.length}/{docs.length} claims
        </span>
      </div>

      <div className="truth-command-input-row">
        <input
          className="truth-command-input"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.home.searchPlaceholder}
        />
        <div className="truth-command-actions" aria-label="Search actions">
          <button className="truth-command-button ghost" type="button" onClick={() => setQuery("")}>CLEAR</button>
          <button className="truth-command-button primary" type="button" onClick={executeSearch}>EXECUTE</button>
        </div>
      </div>

      <div ref={resultsRef} className="truth-command-output">
        {filtered.length === 0 ? (
          <div className="truth-empty-state">
            {query ? (
              <p>
                &quot;{query}&quot; — {t.home.noResults}.{" "}
                <Link href={`/suggest-topic?q=${encodeURIComponent(query)}`}>{t.home.suggestFirst}</Link>
              </p>
            ) : (
              <p>
                {t.home.noDocs} <Link href="/suggest-topic">{t.home.suggestFirst}</Link>
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="truth-results-heading">
              <h2>
                {t.home.registeredDocs} ({filtered.length}
                {query ? ` / ${docs.length}` : ""})
              </h2>
            </div>
            <ul className="truth-search-results">
              {filtered.map((d, index) => (
                <li key={d.slug} className="truth-search-result">
                  <Link
                    ref={index === 0 ? firstResultRef : undefined}
                    href={`/${locale}/wiki/${d.slug}`}
                    className="truth-result-link"
                  >
                    {d.title}
                  </Link>
                  {d.category && <span className="truth-result-meta"> — {d.category}</span>}
                  {d.source === "supabase" && <span className="truth-result-badge">new</span>}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
