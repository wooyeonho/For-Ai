"use client";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, LOCALE_CONFIG, isValidLocale } from "../../lib/i18n";

const LOCALE_AWARE_ROUTES = new Set([
  "wiki",
  "entity",
  "topics",
  "country",
  "bounties",
  "challenges",
  "missions",
  "leaderboard",
]);

const LANGUAGE_PARAM_ROUTES = new Set(["community", "suggest-topic", "report", "hallucination"]);

export function getLocalePath(pathname: string, locale: string, search = ""): string {
  const segments = pathname.split("/").filter(Boolean);
  const hasLocalePrefix = Boolean(segments[0] && isValidLocale(segments[0]));
  const route = hasLocalePrefix ? segments[1] : segments[0];

  if (route && LANGUAGE_PARAM_ROUTES.has(route)) {
    const canonicalSegments = hasLocalePrefix ? segments.slice(1) : segments;
    const params = new URLSearchParams(search);
    params.set("lang", locale);
    const query = params.toString();
    return `/${canonicalSegments.join("/")}${query ? `?${query}` : ""}`;
  }

  if (hasLocalePrefix) {
    return "/" + [locale, ...segments.slice(1)].join("/");
  }

  if (route && LOCALE_AWARE_ROUTES.has(route)) {
    return "/" + [locale, ...segments].join("/");
  }

  // Non-locale pages (homepage, api-docs, tools, etc.) stay as-is.
  return pathname;
}

export function LanguageSelector() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Extract current locale from path or ?lang= for global language-param pages.
  const segments = pathname.split("/").filter(Boolean);
  const pathLocale = segments[0] && isValidLocale(segments[0]) ? segments[0] : null;
  const queryLocale = searchParams.get("lang");
  const currentLocale = pathLocale ?? (queryLocale && isValidLocale(queryLocale) ? queryLocale : DEFAULT_LOCALE);

  // Build path for other locales.
  function getPathForLocale(locale: string): string {
    return getLocalePath(pathname, locale, searchParams.toString());
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
            minWidth: 140,
          }}
        >
          {SUPPORTED_LOCALES.map((locale) => (
            <li key={locale}>
              <Link
                href={getPathForLocale(locale)}
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
              </Link>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
