// lib/i18n/index.ts
export { SUPPORTED_LOCALES, DEFAULT_LOCALE, LOCALE_CONFIG, LANGUAGE_POLICY, isValidLocale, getLocaleDir } from "./locales";
export type { SupportedLocale, TranslationStatus } from "./locales";
export { getTranslations } from "./translations";
export type { UITranslations } from "./translations";
export { localizedHref, nonLocaleFormHref } from "./urls";
