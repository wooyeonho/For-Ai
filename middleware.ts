import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SUPPORTED_LOCALES = ["ko", "en", "hi", "ar", "es", "ja", "zh"];
const DEFAULT_LOCALE = "ko";

// In-memory rate limiter (per Edge worker instance; resets on deploy)
// For production scale, replace with Upstash Redis or similar
const rateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT_ANON = 30;  // requests per minute without API key
const RATE_LIMIT_KEY = 120;  // requests per minute with API key (basic validation)

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

function checkRateLimit(key: string, limit: number): { allowed: boolean; remaining: number; retryAfter: number } {
  const now = Date.now();
  const entry = rateMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateMap.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { allowed: true, remaining: limit - 1, retryAfter: 60 };
  }

  if (entry.count >= limit) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, remaining: 0, retryAfter };
  }

  entry.count++;
  return { allowed: true, remaining: limit - entry.count, retryAfter: 60 };
}

// Periodically prune stale entries (runs every ~100 requests)
let pruneCounter = 0;
function maybePruneMap() {
  if (++pruneCounter < 100) return;
  pruneCounter = 0;
  const now = Date.now();
  for (const [k, v] of rateMap.entries()) {
    if (now > v.resetAt) rateMap.delete(k);
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rate-limit public document API (not admin endpoints)
  if (pathname.startsWith("/api/documents/") || pathname.startsWith("/raw/")) {
    maybePruneMap();
    const hasApiKey = !!request.headers.get("x-api-key");
    const ip = getClientIp(request);
    const rateLimitKey = hasApiKey
      ? `key:${request.headers.get("x-api-key")?.slice(0, 16)}`
      : `ip:${ip}`;
    const limit = hasApiKey ? RATE_LIMIT_KEY : RATE_LIMIT_ANON;
    const { allowed, remaining, retryAfter } = checkRateLimit(rateLimitKey, limit);

    if (!allowed) {
      return new NextResponse(
        JSON.stringify({ error: "Rate limit exceeded", retry_after: retryAfter }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(retryAfter),
            "X-RateLimit-Limit": String(limit),
            "X-RateLimit-Remaining": "0",
          },
        }
      );
    }

    const response = NextResponse.next();
    response.headers.set("X-RateLimit-Limit", String(limit));
    response.headers.set("X-RateLimit-Remaining", String(remaining));
    return response;
  }

  // Skip non-page routes for locale handling
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/admin/") ||
    pathname.startsWith("/raw/") ||
    pathname.startsWith("/diagnostics/") ||
    pathname.startsWith("/report/") ||
    pathname.startsWith("/hallucination/") ||
    pathname.startsWith("/suggest-topic") ||
    pathname.startsWith("/community") ||
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

  // Don't redirect root — homepage handles all languages
  if (pathname === "/") {
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
