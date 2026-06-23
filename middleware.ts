import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SUPPORTED_LOCALES = ["ko", "en", "hi", "ar", "es", "ja", "zh"];
const DEFAULT_LOCALE = "ko";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip non-page routes
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/admin/") ||
    pathname.startsWith("/raw/") ||
    pathname.startsWith("/diagnostics/") ||
    pathname.startsWith("/report/") ||
    pathname.startsWith("/hallucination/") ||
    pathname.startsWith("/suggest-topic") ||
    pathname.startsWith("/llms.txt") ||
    pathname.includes(".") // static files
  ) {
    return NextResponse.next();
  }

  // Check if path already has a locale prefix
  const segments = pathname.split("/").filter(Boolean);
  const firstSegment = segments[0];

  if (firstSegment && SUPPORTED_LOCALES.includes(firstSegment)) {
    return NextResponse.next();
  }

  // Detect locale from Accept-Language header
  const acceptLang = request.headers.get("accept-language") ?? "";
  const detected = detectLocaleFromHeader(acceptLang);

  // Redirect root "/" to locale-specific home
  if (pathname === "/") {
    // Don't redirect root — homepage handles all languages
    return NextResponse.next();
  }

  // For wiki paths without locale, redirect to locale version
  if (firstSegment === "wiki" || (segments.length >= 2 && segments[0] === "wiki")) {
    const url = request.nextUrl.clone();
    url.pathname = `/${detected}${pathname}`;
    return NextResponse.redirect(url, 308);
  }

  return NextResponse.next();
}

function detectLocaleFromHeader(header: string): string {
  const langMap: Record<string, string> = {
    ko: "ko", kr: "ko",
    en: "en", us: "en", gb: "en", au: "en",
    hi: "hi", in: "hi",
    ar: "ar", sa: "ar",
    es: "es", mx: "es",
    ja: "ja", jp: "ja",
    zh: "zh", cn: "zh", tw: "zh",
  };

  const parts = header.split(",");
  for (const part of parts) {
    const lang = part.trim().split(";")[0].toLowerCase();
    const code = lang.split("-")[0];
    if (langMap[code]) return langMap[code];
  }
  return DEFAULT_LOCALE;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"],
};
