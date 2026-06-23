"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { SUPPORTED_LOCALES, LOCALE_CONFIG, isValidLocale } from "../../lib/i18n";

export function LanguageSelector() {
  const pathname = usePathname();

  // Extract current locale from path
  const segments = pathname.split("/").filter(Boolean);
  const currentLocale = segments[0] && isValidLocale(segments[0]) ? segments[0] : "ko";

  // Build path for other locales
  function getLocalePath(locale: string): string {
    if (segments[0] && isValidLocale(segments[0])) {
      return "/" + [locale, ...segments.slice(1)].join("/");
    }
    return `/${locale}`;
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
            right: 0,
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
                href={getLocalePath(locale)}
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
