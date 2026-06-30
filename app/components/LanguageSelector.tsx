"use client";
import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, LOCALE_CONFIG, isValidLocale } from "../../lib/i18n";

const DOCUMENT_ACTION_ROUTES = new Set(["report", "hallucination", "diagnostics"]);

function normalizeLocale(locale: string | null | undefined): string | null {
  if (!locale) return null;
  const normalized = locale.toLowerCase().split("-")[0];
  return isValidLocale(normalized) ? normalized : null;
}

function getBrowserLocale(): string | null {
  if (typeof navigator === "undefined") return null;

  for (const language of navigator.languages?.length ? navigator.languages : [navigator.language]) {
    const locale = normalizeLocale(language);
    if (locale) return locale;
  }

  return null;
}

export function getCurrentLocale(
  pathname: string,
  queryLocale?: string | null,
  browserLocale?: string | null,
  detectBrowser = false,
): string {
  const pathLocale = normalizeLocale(pathname.split("/").filter(Boolean)[0]);
  return normalizeLocale(queryLocale) ?? pathLocale ?? normalizeLocale(browserLocale) ?? (detectBrowser ? getBrowserLocale() : null) ?? DEFAULT_LOCALE;
}

export function getLocalePath(pathname: string, locale: string): string {
  const segments = pathname.split("/").filter(Boolean);

  if (segments[0] && isValidLocale(segments[0])) {
    const [, route, identifier] = segments;
    if ((route === "wiki" || route === "entity") && identifier) {
      return "/" + [locale, ...segments.slice(1)].join("/");
    }
  }

  const [route, identifier] = segments;
  if (route && DOCUMENT_ACTION_ROUTES.has(route) && identifier) {
    return `/${locale}/wiki/${identifier}`;
  }

  if (segments[0] === "community") {
    return `/community?lang=${locale}`;
  }

  // Non-locale pages (homepage, api-docs, etc.) stay as-is
  return pathname;
}

export function LanguageSelector() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [browserLocale, setBrowserLocale] = useState<string | null>(null);
  const currentLocale = getCurrentLocale(pathname, searchParams.get("lang"), browserLocale);

  useEffect(() => {
    if (!searchParams.get("lang")) {
      setBrowserLocale(getBrowserLocale());
    }
  }, [searchParams]);

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
