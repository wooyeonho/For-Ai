import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SUPPORTED_LOCALES = ["ko", "en", "hi", "ar", "es", "ja", "zh"];
// Final fallback locale when Accept-Language has no match. Defaults to "en" for a
// global audience (NEXT_PUBLIC_DEFAULT_LOCALE is build-inlined). Korean browsers
// still resolve to "ko" via the Accept-Language detection below.
const ENV_DEFAULT = process.env.NEXT_PUBLIC_DEFAULT_LOCALE;
const DEFAULT_LOCALE = ENV_DEFAULT && SUPPORTED_LOCALES.includes(ENV_DEFAULT) ? ENV_DEFAULT : "en";

// In-memory rate limiter (per Edge worker instance; resets on deploy).
// TODO: Replace this process-local Map with a shared Upstash Redis, Supabase-backed,
// or equivalent distributed limiter before relying on these limits for production
// abuse prevention across multiple Edge workers/regions.
type RateBucket = { count: number; resetAt: number };
type RateCheck = { allowed: boolean; remaining: number; retryAfter: number };
type RateLimitPolicy = { name: "read" | "write"; minute: number; hour: number };

const rateMap = new Map<string, RateBucket>();
const RATE_WINDOW_MS = 60_000;
const RATE_HOUR_WINDOW_MS = 60 * RATE_WINDOW_MS;
const READ_RATE_LIMIT_ANON = 30;  // requests per minute without API key
const READ_RATE_LIMIT_KEY = 120;  // requests per minute with API key (basic validation)
const WRITE_RATE_LIMIT_PER_MINUTE = 5;
const WRITE_RATE_LIMIT_PER_HOUR = 30;

const READ_LIMITED_PREFIXES = [
  "/api/documents/",
  "/raw/",
  "/api/index",
  "/api/entities/",
  "/api/posts",
  "/api/report/",
  "/api/hallucination/",
  "/api/suggest-topic",
  "/api/business/profile",
];

const WRITE_LIMITED_PREFIXES = [
  "/api/posts",
  "/api/report/",
  "/api/hallucination/",
  "/api/suggest-topic",
  "/api/business/profile",
];

function pathMatchesAny(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => prefix.endsWith("/") ? pathname.startsWith(prefix) : pathname === prefix);
}

function isWriteRateLimitedRequest(pathname: string, method: string): boolean {
  return method !== "GET" && method !== "HEAD" && pathMatchesAny(pathname, WRITE_LIMITED_PREFIXES);
}

function getRateLimitPolicy(request: NextRequest): RateLimitPolicy | null {
  const { pathname } = request.nextUrl;

  if (isWriteRateLimitedRequest(pathname, request.method)) {
    return { name: "write", minute: WRITE_RATE_LIMIT_PER_MINUTE, hour: WRITE_RATE_LIMIT_PER_HOUR };
  }

  if (pathMatchesAny(pathname, READ_LIMITED_PREFIXES)) {
    const hasApiKey = !!request.headers.get("x-api-key");
    const perMinute = hasApiKey ? READ_RATE_LIMIT_KEY : READ_RATE_LIMIT_ANON;
    return { name: "read", minute: perMinute, hour: perMinute * 60 };
  }

  return null;
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

function checkRateWindow(key: string, limit: number, windowMs: number): RateCheck {
  const now = Date.now();
  const entry = rateMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateMap.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfter: Math.ceil(windowMs / 1000) };
  }

  if (entry.count >= limit) {
    const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    return { allowed: false, remaining: 0, retryAfter };
  }

  entry.count++;
  return { allowed: true, remaining: limit - entry.count, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
}

function checkRateLimit(key: string, policy: RateLimitPolicy): RateCheck {
  const minute = checkRateWindow(`${key}:minute`, policy.minute, RATE_WINDOW_MS);
  if (!minute.allowed) return minute;

  const hour = checkRateWindow(`${key}:hour`, policy.hour, RATE_HOUR_WINDOW_MS);
  if (!hour.allowed) return hour;

  return {
    allowed: true,
    remaining: Math.min(minute.remaining, hour.remaining),
    retryAfter: minute.retryAfter,
  };
}

function rateLimitExceededResponse(policy: RateLimitPolicy, retryAfter: number): NextResponse {
  return NextResponse.json(
    { error: "Rate limit exceeded", retry_after: retryAfter },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfter),
        "X-RateLimit-Policy": policy.name,
        "X-RateLimit-Limit": `${policy.minute};w=60, ${policy.hour};w=3600`,
        "X-RateLimit-Remaining": "0",
      },
    },
  );
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

  // Rate-limit public API endpoints (not admin endpoints). Public write routes
  // intentionally use a stricter IP-only policy than read/citation endpoints.
  const policy = getRateLimitPolicy(request);
  if (policy) {
    maybePruneMap();
    const hasApiKey = policy.name === "read" && !!request.headers.get("x-api-key");
    const ip = getClientIp(request);
    const rateLimitKey = hasApiKey
      ? `${policy.name}:key:${request.headers.get("x-api-key")?.slice(0, 16)}`
      : `${policy.name}:ip:${ip}`;
    const { allowed, remaining, retryAfter } = checkRateLimit(rateLimitKey, policy);

    if (!allowed) {
      return rateLimitExceededResponse(policy, retryAfter);
    }

    const response = NextResponse.next();
    response.headers.set("X-RateLimit-Policy", policy.name);
    response.headers.set("X-RateLimit-Limit", `${policy.minute};w=60, ${policy.hour};w=3600`);
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
