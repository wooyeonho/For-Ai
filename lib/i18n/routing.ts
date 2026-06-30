import { DEFAULT_LOCALE, isValidLocale, type SupportedLocale } from "./locales";

const DOCUMENT_ACTION_ROUTES = new Set(["report", "hallucination", "diagnostics"]);

export const I18N_SMOKE_TEST_SLUG = "myungdong-laluce-parking";

export const I18N_PRIMARY_ROUTE_BUILDERS = [
  (locale: SupportedLocale) => `/${locale}`,
  (locale: SupportedLocale, slug = I18N_SMOKE_TEST_SLUG) => `/${locale}/wiki/${slug}`,
  (locale: SupportedLocale) => `/${locale}/topics`,
  (locale: SupportedLocale) => `/${locale}/countries`,
  (locale: SupportedLocale) => `/${locale}/bounties`,
] as const;

export function getCurrentLocaleFromPath(pathname: string): SupportedLocale {
  const firstSegment = pathname.split("/").filter(Boolean)[0];
  return firstSegment && isValidLocale(firstSegment) ? firstSegment : DEFAULT_LOCALE;
}

export function getLocalePath(pathname: string, locale: SupportedLocale | string): string {
  const segments = pathname.split("/").filter(Boolean);

  if (segments[0] && isValidLocale(segments[0])) {
    const [, route, identifier] = segments;
    if ((route === "wiki" || route === "entity") && identifier) {
      return "/" + [locale, ...segments.slice(1)].join("/");
    }

    if (segments.length === 1 || ["topics", "countries", "bounties"].includes(route ?? "")) {
      return "/" + [locale, ...segments.slice(1)].join("/");
    }
  }

  const [route, identifier] = segments;
  if (route && DOCUMENT_ACTION_ROUTES.has(route) && identifier) {
    return getDocumentReturnPath(String(locale), identifier);
  }

  return pathname;
}

export function getDocumentReturnPath(locale: SupportedLocale | string, slug: string): string {
  return `/${locale}/wiki/${slug}`;
}

export function getReportReturnUrl(locale: SupportedLocale | string, slug: string): string {
  return getDocumentReturnPath(locale, slug);
}

export function getHallucinationReturnUrl(locale: SupportedLocale | string, slug: string): string {
  return getDocumentReturnPath(locale, slug);
}
