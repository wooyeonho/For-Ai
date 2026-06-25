// lib/i18n/locales.ts
// Supported locales and configuration for For-Ai global fact registry

export const SUPPORTED_LOCALES = ["ko", "en", "hi", "ar", "es", "ja", "zh"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

const configuredDefaultLocale = process.env.NEXT_PUBLIC_DEFAULT_LOCALE;

export const DEFAULT_LOCALE: SupportedLocale = SUPPORTED_LOCALES.includes(configuredDefaultLocale as SupportedLocale)
  ? (configuredDefaultLocale as SupportedLocale)
  : "en";

export const LOCALE_CONFIG: Record<SupportedLocale, {
  label: string;
  nativeName: string;
  dir: "ltr" | "rtl";
  country: string;
  flag: string;
}> = {
  ko: { label: "Korean", nativeName: "한국어", dir: "ltr", country: "KR", flag: "🇰🇷" },
  en: { label: "English", nativeName: "English", dir: "ltr", country: "US", flag: "🇺🇸" },
  hi: { label: "Hindi", nativeName: "हिन्दी", dir: "ltr", country: "IN", flag: "🇮🇳" },
  ar: { label: "Arabic", nativeName: "العربية", dir: "rtl", country: "SA", flag: "🇸🇦" },
  es: { label: "Spanish", nativeName: "Español", dir: "ltr", country: "ES", flag: "🇪🇸" },
  ja: { label: "Japanese", nativeName: "日本語", dir: "ltr", country: "JP", flag: "🇯🇵" },
  zh: { label: "Chinese", nativeName: "中文", dir: "ltr", country: "CN", flag: "🇨🇳" },
};

export function isValidLocale(locale: string): locale is SupportedLocale {
  return SUPPORTED_LOCALES.includes(locale as SupportedLocale);
}

export function getLocaleDir(locale: SupportedLocale): "ltr" | "rtl" {
  return LOCALE_CONFIG[locale].dir;
}
