import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SUPPORTED_LOCALES = ["ko", "en", "hi", "ar", "es", "ja", "zh"];
// Final fallback locale when Accept-Language has no match. Defaults to "en" for a
// global audience (NEXT_PUBLIC_DEFAULT_LOCALE is build-inlined). Korean browsers
// still resolve to "ko" via the Accept-Language detection below.
const ENV_DEFAULT = process.env.NEXT_PUBLIC_DEFAULT_LOCALE;
const DEFAULT_LOCALE = ENV_DEFAULT && SUPPORTED_LOCALES.includes(ENV_DEFAULT) ? ENV_DEFAULT : "en";

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

const LANGUAGE_PARAM_ROUTES = new Set([
  "community",
  "suggest-topic",
  "report",
  "hallucination",
]);

const MACHINE_ROUTE_PREFIXES = [
  "/api",
  "/raw",
  "/llms.txt",
  "/robots",
  "/sitemap",
];

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const segments = pathname.split("/").filter(Boolean);
  const firstSegment = segments[0];
  const hasLocalePrefix = Boolean(firstSegment && SUPPORTED_LOCALES.includes(firstSegment));
  const routeSegment = hasLocalePrefix ? segments[1] : firstSegment;

  // Skip machine/API routes and static assets for locale handling.
  if (isMachineOrAssetPath(pathname)) {
    return NextResponse.next();
  }

  // Admin and diagnostics are internal tools with their own routing policies.
  if (pathname.startsWith("/admin/") || pathname.startsWith("/diagnostics/")) {
    return NextResponse.next();
  }

  // Language-param pages are global pages. If a locale route is used, normalize
  // it to the canonical global URL and carry the locale in ?lang=.
  if (hasLocalePrefix && routeSegment && LANGUAGE_PARAM_ROUTES.has(routeSegment)) {
    const url = request.nextUrl.clone();
    url.pathname = `/${segments.slice(1).join("/")}`;
    url.searchParams.set("lang", firstSegment!);
    return NextResponse.redirect(url, 308);
  }

  if (hasLocalePrefix) {
    return NextResponse.next();
  }

  const detected = detectLocaleFromHeader(request.headers.get("accept-language") ?? "");

  // Don't redirect root — homepage handles all languages.
  if (pathname === "/") {
    return NextResponse.next();
  }

  // Locale-aware registry pages must have a locale prefix.
  if (routeSegment && LOCALE_AWARE_ROUTES.has(routeSegment)) {
    const url = request.nextUrl.clone();
    url.pathname = `/${detected}${pathname}`;
    return NextResponse.redirect(url, 308);
  }

  // Global language-param pages stay unprefixed but should carry an explicit
  // language selection for consistent rendering/linking.
  if (routeSegment && LANGUAGE_PARAM_ROUTES.has(routeSegment) && !searchParams.get("lang")) {
    const url = request.nextUrl.clone();
    url.searchParams.set("lang", detected);
    return NextResponse.redirect(url, 308);
  }

  return NextResponse.next();
}

function isMachineOrAssetPath(pathname: string): boolean {
  return (
    MACHINE_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) ||
    pathname.startsWith("/_next/") ||
    pathname.includes(".")
  );
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
