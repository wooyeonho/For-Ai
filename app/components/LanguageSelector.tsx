"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { SUPPORTED_LOCALES, LOCALE_CONFIG, isValidLocale } from "../../lib/i18n";

const REPRESENTATIVE_WIKI_SLUG = "myungdong-laluce-parking";

function isLocaleWikiPath(parts: string[]): boolean {
  return parts.length >= 3 && isValidLocale(parts[0]) && parts[1] === "wiki" && Boolean(parts[2]);
}

function isLocaleEntityPath(parts: string[]): boolean {
  return parts.length >= 3 && isValidLocale(parts[0]) && parts[1] === "entity" && Boolean(parts[2]);
}

export function LanguageSelector() {
  const pathname = usePathname();

  // Extract current locale from path
  const segments = pathname.split("/").filter(Boolean);
  const currentLocale = segments[0] && isValidLocale(segments[0]) ? segments[0] : "ko";

  // Build path for other locales. Only locale-aware wiki/entity routes exist today.
  // Non-locale pages such as /api-docs, /community, /suggest-topic,
  // /report/*, /hallucination/*, and /diagnostics/* fall back to a
  // representative wiki document instead of linking to a missing /{locale} page.
  function getLocalePath(locale: string): string {
    if (isLocaleWikiPath(segments) || isLocaleEntityPath(segments)) {
      return "/" + [locale, ...segments.slice(1)].join("/");
    }

    return `/${locale}/wiki/${REPRESENTATIVE_WIKI_SLUG}`;
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
