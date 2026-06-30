import { DEFAULT_LOCALE, isValidLocale } from "./locales";
import type { SupportedLocale } from "./locales";

const LOCALE_ROUTED_ROOTS = new Set([
  "ai-wrong-about",
  "bounties",
  "campaigns",
  "challenges",
  "compare",
  "contributors",
  "country",
  "entity",
  "leaderboard",
  "missions",
  "quests",
  "topics",
  "wiki",
]);

const NON_LOCALE_ROOTS = new Set([
  "admin",
  "api",
  "diagnostics",
  "hallucination",
  "raw",
  "report",
  "suggest-topic",
]);

function splitPath(path: string): { pathname: string; suffix: string } {
  const markerIndex = path.search(/[?#]/);
  if (markerIndex === -1) return { pathname: path || "/", suffix: "" };
  return { pathname: path.slice(0, markerIndex) || "/", suffix: path.slice(markerIndex) };
}

function normalizePathname(pathname: string): string {
  if (!pathname) return "/";
  return pathname.startsWith("/") ? pathname : `/${pathname}`;
}

export function getCurrentLocaleFromPath(pathname: string): SupportedLocale {
  const firstSegment = normalizePathname(pathname).split("/").filter(Boolean)[0];
  return firstSegment && isValidLocale(firstSegment) ? firstSegment : DEFAULT_LOCALE;
}

export function localizedPath(locale: string, path: string): string {
  const safeLocale = isValidLocale(locale) ? locale : DEFAULT_LOCALE;
  const { pathname, suffix } = splitPath(path);
  const normalized = normalizePathname(pathname);
  const segments = normalized.split("/").filter(Boolean);

  if (segments.length === 0) return `${normalized}${suffix}`;

  if (isValidLocale(segments[0])) {
    return `/${[safeLocale, ...segments.slice(1)].join("/")}${suffix}`;
  }

  if (NON_LOCALE_ROOTS.has(segments[0])) return `${normalized}${suffix}`;
  if (!LOCALE_ROUTED_ROOTS.has(segments[0])) return `${normalized}${suffix}`;

  return `/${[safeLocale, ...segments].join("/")}${suffix}`;
}

export function withLangQuery(locale: string, path: string): string {
  const safeLocale = isValidLocale(locale) ? locale : DEFAULT_LOCALE;
  const [baseAndQuery, hash = ""] = path.split("#", 2);
  const [base, query = ""] = baseAndQuery.split("?", 2);
  const params = new URLSearchParams(query);
  params.set("lang", safeLocale);
  if (!params.has("return")) params.set("return", localizedPath(safeLocale, base || "/"));
  const queryString = params.toString();
  return `${base || "/"}${queryString ? `?${queryString}` : ""}${hash ? `#${hash}` : ""}`;
}
