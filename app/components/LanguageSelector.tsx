"use client";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, LOCALE_CONFIG, isValidLocale, type SupportedLocale } from "../../lib/i18n";

const QUERY_LANGUAGE_ROUTES = new Set(["community", "suggest-topic", "report", "hallucination"]);
const DOCUMENT_LANGUAGE_ROUTES = new Set(["report", "hallucination", "diagnostics"]);

type SearchParamsInput = URLSearchParams | ReadonlyURLSearchParams | string | null | undefined;

type ReadonlyURLSearchParams = {
  toString(): string;
};

function getQueryString(searchParams?: SearchParamsInput): string {
  if (!searchParams) return "";
  return typeof searchParams === "string" ? searchParams.replace(/^\?/, "") : searchParams.toString();
}

function appendLangQuery(pathname: string, locale: string, searchParams?: SearchParamsInput): string {
  const params = new URLSearchParams(getQueryString(searchParams));
  params.set("lang", locale);
  return `${pathname}?${params.toString()}`;
}

function getCurrentUrl(pathname: string, searchParams?: SearchParamsInput): string {
  const queryString = getQueryString(searchParams);
  return queryString ? `${pathname}?${queryString}` : pathname;
}

export function getLocalePath(pathname: string, locale: string, searchParams?: SearchParamsInput): string {
  const segments = pathname.split("/").filter(Boolean);

  // Localized routes keep their route shape; only the leading locale changes.
  if (segments[0] && isValidLocale(segments[0])) {
    return "/" + [locale, ...segments.slice(1)].join("/");
  }

  // The root page should become an explicit locale route after selection.
  if (segments.length === 0) {
    return `/${locale}`;
  }

  const [route, identifier] = segments;

  // Non-localized language-aware pages use a lang query parameter.
  if (route && QUERY_LANGUAGE_ROUTES.has(route)) {
    return appendLangQuery(pathname, locale, searchParams);
  }

  // Document action pages without query handling can fall back to the wiki page.
  if (route && DOCUMENT_LANGUAGE_ROUTES.has(route) && identifier) {
    return `/${locale}/wiki/${identifier}`;
  }

  if (pathname === "/" || segments.length === 0) {
    return `/${locale}`;
  }

  // Other non-locale pages stay as-is.
  return getCurrentUrl(pathname, searchParams);
}

export function LanguageSelector() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentUrl = getCurrentUrl(pathname, searchParams);

  // Extract current locale from path first, then from lang query for non-localized pages.
  const segments = pathname.split("/").filter(Boolean);
  const queryLocale = searchParams.get("lang");
  const currentLocale =
    segments[0] && isValidLocale(segments[0])
      ? segments[0]
      : queryLocale && isValidLocale(queryLocale)
        ? queryLocale
        : DEFAULT_LOCALE;

  function getPathForLocale(locale: string): string {
    return getLocalePath(pathname, locale, searchParams);
  }

  function isSameDestination(href: string): boolean {
    return href === `${pathname}${currentSearch}` || href === pathname;
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
            minWidth: 160,
          }}
        >
          {SUPPORTED_LOCALES.map((locale) => {
            const href = getPathForLocale(locale);
            const isActive = locale === currentLocale;
            const isSameUrl = href === currentUrl;
            const itemStyle = {
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              width: "100%",
              padding: "6px 14px",
              fontSize: 13,
              color: isActive ? "#2563eb" : "#374151",
              fontWeight: isActive ? 600 : 400,
              textDecoration: "none",
              background: isActive ? "#eff6ff" : "transparent",
              border: 0,
              cursor: isSameUrl ? "not-allowed" : "pointer",
              opacity: isSameUrl ? 0.72 : 1,
              textAlign: "start" as const,
            };
            const label = `${LOCALE_CONFIG[locale].flag} ${LOCALE_CONFIG[locale].nativeName}`;

            return (
              <li key={locale}>
                {isSameUrl ? (
                  <button type="button" disabled aria-current={isActive ? "true" : undefined} style={itemStyle}>
                    <span>{label}</span>
                    {isActive ? <span aria-hidden="true">✓</span> : null}
                  </button>
                ) : (
                  <Link href={href} aria-current={isActive ? "true" : undefined} style={itemStyle}>
                    <span>{label}</span>
                    {isActive ? <span aria-hidden="true">✓</span> : null}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </details>
    </div>
  );
}
