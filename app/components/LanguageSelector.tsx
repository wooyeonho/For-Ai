"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, LOCALE_CONFIG, isValidLocale } from "../../lib/i18n";

const DOCUMENT_ACTION_ROUTES = new Set(["report", "hallucination", "diagnostics"]);
const LOCALE_ROUTE_SEGMENTS = new Set([
  "ai-wrong-about",
  "bounties",
  "campaigns",
  "challenges",
  "compare",
  "community",
  "contributors",
  "country",
  "entity",
  "leaderboard",
  "missions",
  "quests",
  "suggest-topic",
  "topics",
  "wiki",
]);

export function getLocalePath(pathname: string, locale: string): string {
  const segments = pathname.split("/").filter(Boolean);

  if (segments[0] && isValidLocale(segments[0])) {
    return "/" + [locale, ...segments.slice(1)].join("/");
  }

  const [route, identifier] = segments;

  if (!route) {
    return `/${locale}`;
  }

  if (route === "community") {
    return `/${locale}/community`;
  }

  if (route === "suggest-topic") {
    return `/suggest-topic?lang=${locale}`;
  }

  if (route && DOCUMENT_ACTION_ROUTES.has(route) && identifier) {
    return `/${locale}/wiki/${identifier}`;
  }

  return pathname;
}

function hasLocalePage(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);

  if (!segments[0]) {
    return true;
  }

  if (segments[0] && isValidLocale(segments[0])) {
    const route = segments[1];
    return !route || LOCALE_ROUTE_SEGMENTS.has(route);
  }

  const route = segments[0];
  return route === "community" || route === "suggest-topic" || DOCUMENT_ACTION_ROUTES.has(route);
}

export function LanguageSelector() {
  const pathname = usePathname();

  // Extract current locale from path
  const segments = pathname.split("/").filter(Boolean);
  const currentLocale = segments[0] && isValidLocale(segments[0]) ? segments[0] : DEFAULT_LOCALE;
  const pageHasLocaleFallback = !hasLocalePage(pathname);

  // Build path for other locales
  function getPathForLocale(locale: string): string {
    return getLocalePath(pathname, locale);
  }

  return (
    <div className="lang-selector" style={{ position: "relative", display: "inline-block" }}>
      <details style={{ position: "relative" }}>
        <summary
          style={{
            cursor: "pointer",
            fontSize: 13,
            padding: "4px 10px",
            border: "1px solid #e5e7eb",
            borderRadius: 6,
            background: "#f9fafb",
            listStyle: "none",
          }}
        >
          {LOCALE_CONFIG[currentLocale as keyof typeof LOCALE_CONFIG]?.flag ?? ""}{" "}
          {LOCALE_CONFIG[currentLocale as keyof typeof LOCALE_CONFIG]?.nativeName ?? currentLocale}
        </summary>
        <ul
          style={{
            position: "absolute",
            insetInlineEnd: 0,
            top: "100%",
            marginTop: 4,
            padding: "4px 0",
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            listStyle: "none",
            zIndex: 100,
            minWidth: 220,
          }}
        >
          {pageHasLocaleFallback && (
            <li
              style={{
                padding: "7px 14px",
                borderBottom: "1px solid #f3f4f6",
                color: "#6b7280",
                fontSize: 12,
                lineHeight: 1.35,
              }}
            >
              이 페이지는 아직 번역 없음
            </li>
          )}
          {SUPPORTED_LOCALES.map((locale) => (
            <li key={locale}>
              <Link
                href={getPathForLocale(locale)}
                title={pageHasLocaleFallback ? "이 페이지는 아직 번역 없음" : undefined}
                style={{
                  display: "block",
                  padding: "6px 14px",
                  fontSize: 13,
                  color: locale === currentLocale ? "#2563eb" : "#374151",
                  fontWeight: locale === currentLocale ? 600 : 400,
                  textDecoration: "none",
                }}
              >
                {LOCALE_CONFIG[locale].flag} {LOCALE_CONFIG[locale].nativeName}
                {pageHasLocaleFallback ? " · 번역 없음" : ""}
              </Link>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
