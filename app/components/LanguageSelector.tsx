"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, LOCALE_CONFIG, isValidLocale } from "../../lib/i18n";

const DOCUMENT_ACTION_ROUTES = new Set(["report", "hallucination", "diagnostics"]);

type LanguageSelectorProps = {
  onNavigate?: () => void;
};

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

  // Non-locale pages (homepage, api-docs, community, etc.) stay as-is
  return pathname;
}

export function LanguageSelector({ onNavigate }: LanguageSelectorProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [loadingHref, setLoadingHref] = useState<string | null>(null);

  useEffect(() => {
    setOpen(false);
    setLoadingHref(null);
  }, [pathname]);

  // Extract current locale from path
  const segments = pathname.split("/").filter(Boolean);
  const currentLocale = segments[0] && isValidLocale(segments[0]) ? segments[0] : DEFAULT_LOCALE;

  // Build path for other locales
  function getPathForLocale(locale: string): string {
    return getLocalePath(pathname, locale);
  }

  return (
    <div className="lang-selector" style={{ position: "relative", display: "inline-block" }}>
      <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)} style={{ position: "relative" }}>
        <summary
          aria-label="Select language"
          aria-expanded={open}
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
          {loadingHref ? <span aria-live="polite" style={{ marginInlineStart: 6, color: "#6b7280" }}>…</span> : null}
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
          {SUPPORTED_LOCALES.map((locale) => {
            const href = getPathForLocale(locale);
            const isCurrentHref = href === pathname;
            const isLoading = loadingHref === href;
            const optionStyle = {
              display: "block",
              padding: "6px 14px",
              fontSize: 13,
              color: isCurrentHref ? "#9ca3af" : isLoading ? "#2563eb" : "#374151",
              fontWeight: locale === currentLocale ? 600 : 400,
              textDecoration: "none",
              cursor: isCurrentHref ? "not-allowed" : "pointer",
              background: isLoading ? "#eff6ff" : "transparent",
              opacity: isCurrentHref ? 0.65 : 1,
              whiteSpace: "nowrap" as const,
            };

            return (
              <li key={locale}>
                {isCurrentHref ? (
                  <span aria-disabled="true" aria-current={locale === currentLocale ? "true" : undefined} style={optionStyle}>
                    {LOCALE_CONFIG[locale].flag} {LOCALE_CONFIG[locale].nativeName}
                  </span>
                ) : (
                  <Link
                    href={href}
                    aria-busy={isLoading || undefined}
                    onClick={() => {
                      setLoadingHref(href);
                      setOpen(false);
                      onNavigate?.();
                    }}
                    style={optionStyle}
                  >
                    {LOCALE_CONFIG[locale].flag} {LOCALE_CONFIG[locale].nativeName}
                    {isLoading ? <span aria-live="polite" style={{ marginInlineStart: 6 }}>Loading…</span> : null}
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
