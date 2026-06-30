import type { SupportedLocale } from "./locales";

type QueryValue = string | number | boolean | null | undefined;
type Query = Record<string, QueryValue> | URLSearchParams;

function appendQuery(path: string, query?: Query): string {
  if (!query) return path;
  const [pathname, hash = ""] = path.split("#", 2);
  const [base, existingQuery = ""] = pathname.split("?", 2);
  const params = new URLSearchParams(existingQuery);

  if (query instanceof URLSearchParams) {
    query.forEach((value, key) => params.set(key, value));
  } else {
    Object.entries(query).forEach(([key, value]) => {
      if (value === null || value === undefined) return;
      params.set(key, String(value));
    });
  }

  const search = params.toString();
  return `${base}${search ? `?${search}` : ""}${hash ? `#${hash}` : ""}`;
}

function normalizePath(path: string): string {
  if (!path) return "/";
  return path.startsWith("/") ? path : `/${path}`;
}

export function localizedHref(locale: SupportedLocale | string, path: string, query?: Query): string {
  const normalizedPath = normalizePath(path);
  return appendQuery(`/${locale}${normalizedPath === "/" ? "" : normalizedPath}`, query);
}

export function nonLocaleFormHref(
  locale: SupportedLocale | string,
  path: string,
  query?: Query,
  returnPath?: string,
): string {
  const normalizedPath = normalizePath(path);
  return appendQuery(normalizedPath, {
    ...(!(query instanceof URLSearchParams) ? query : Object.fromEntries(query.entries())),
    lang: locale,
    return: returnPath ?? localizedHref(locale, "/"),
  });
}
