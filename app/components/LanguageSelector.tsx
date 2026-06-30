"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { SUPPORTED_LOCALES, LOCALE_CONFIG } from "../../lib/i18n";
import { getCurrentLocaleFromPath, localizedPath, withLangQuery } from "../../lib/i18n/routing";

export function LanguageSelector() {
  const pathname = usePathname();

  const currentLocale = getCurrentLocaleFromPath(pathname);

  function getPathForLocale(locale: string): string {
    const segments = pathname.split("/").filter(Boolean);
    const [route, identifier] = segments[0] && segments[0] === currentLocale ? segments.slice(1) : segments;
    if ((route === "report" || route === "hallucination" || route === "diagnostics") && identifier) {
      return localizedPath(locale, `/wiki/${identifier}`);
    }
    return localizedPath(locale, pathname) === pathname ? withLangQuery(locale, pathname) : localizedPath(locale, pathname);
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
