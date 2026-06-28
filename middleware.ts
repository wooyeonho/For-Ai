import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SUPPORTED_LOCALES = ["ko", "en", "hi", "ar", "es", "ja", "zh"];
// Final fallback locale when Accept-Language has no match. Defaults to "en" for a
// global audience (NEXT_PUBLIC_DEFAULT_LOCALE is build-inlined). Korean browsers
// still resolve to "ko" via the Accept-Language detection below.
const ENV_DEFAULT = process.env.NEXT_PUBLIC_DEFAULT_LOCALE;
const DEFAULT_LOCALE = ENV_DEFAULT && SUPPORTED_LOCALES.includes(ENV_DEFAULT) ? ENV_DEFAULT : "en";

// In-memory rate limiter (per Edge worker instance; resets on deploy)
// For production scale, replace with Upstash Redis or similar.
const rateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT_READ_ANON = 300; // crawler-friendly reads per minute without API key
const RATE_LIMIT_READ_KEY = 1_200; // crawler-friendly reads per minute with API key
const RATE_LIMIT_WRITE_ANON = 30; // abusive write/counter protection without API key
const RATE_LIMIT_WRITE_KEY = 120; // abusive write/counter protection with API key

type RatePolicy = {
  name: "read" | "write";
  anonLimit: number;
  keyedLimit: number;
};

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

function ratePolicyForRequest(request: NextRequest): RatePolicy | null {
  const { pathname } = request.nextUrl;
  const isRead = request.method === "GET" || request.method === "HEAD";

  // AI crawlers, search crawlers, and smoke tests need to retrieve many public
  // registry documents in a burst. Keep read-only surfaces on a separate,
  // crawler-friendly bucket from write/counter endpoints.
  if (
    isRead &&
    (pathname.startsWith("/api/documents/") ||
      pathname.startsWith("/raw/") ||
      pathname.startsWith("/api/index") ||
      pathname.startsWith("/api/entities/"))
  ) {
    return {
      name: "read",
      anonLimit: RATE_LIMIT_READ_ANON,
      keyedLimit: RATE_LIMIT_READ_KEY,
    };
  }

  // Counter endpoints and any future non-read public document mutations stay in
  // the stricter abuse-protection bucket. Per-document counter limits are still
  // enforced inside the individual route handlers.
  if (pathname.startsWith("/api/documents/")) {
    return {
      name: "write",
      anonLimit: RATE_LIMIT_WRITE_ANON,
      keyedLimit: RATE_LIMIT_WRITE_KEY,
    };
  }

  return null;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rate-limit public machine-readable endpoints (not admin endpoints).
  const policy = ratePolicyForRequest(request);
  if (policy) {
    maybePruneMap();
    const apiKey = request.headers.get("x-api-key");
    const hasApiKey = !!apiKey;
    const ip = getClientIp(request);
    const rateLimitKey = hasApiKey
      ? `${policy.name}:key:${apiKey.slice(0, 16)}`
      : `${policy.name}:ip:${ip}`;
    const limit = hasApiKey ? policy.keyedLimit : policy.anonLimit;
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
            "X-RateLimit-Policy": policy.name,
          },
        }
      );
    }

    const response = NextResponse.next();
    response.headers.set("X-RateLimit-Limit", String(limit));
    response.headers.set("X-RateLimit-Remaining", String(remaining));
    response.headers.set("X-RateLimit-Policy", policy.name);
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
