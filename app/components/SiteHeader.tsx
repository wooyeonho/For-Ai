"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getLocaleFromPathname, getTranslations, withLocaleLink } from "../../lib/i18n/translations";
import { LanguageSelector } from "./LanguageSelector";
import { DEFAULT_LOCALE, isValidLocale } from "../../lib/i18n/locales";
import type { SupportedLocale } from "../../lib/i18n/locales";


function localeHref(locale: string, path: string): string {
  if (path.startsWith("#")) return `/${locale}${path}`;
  return `/${locale}${path.startsWith("/") ? path : `/${path}`}`;
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname);
  const t = getTranslations(locale);
  const close = () => setOpen(false);
  const localize = (href: string) => withLocaleLink(pathname, href);

  const navLinks = [
    { href: localeHref(locale, "/#registry"), label: t.nav.registry },
    { href: localeHref(locale, "/api-docs"), label: t.nav.api },
    { href: localeHref(locale, "/community"), label: t.nav.community },
    { href: localeHref(locale, "/contribute"), label: t.nav.contribute },
    { href: localeHref(locale, "/suggest-topic"), label: t.nav.suggestTopic },
  ];

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href={localize("/")} className="brand" aria-label="For-Ai home" onClick={close}>
          <span className="brand-mark">For-Ai</span>
          <span className="brand-sub">{t.site.subtitle}</span>
        </Link>
        <nav className="site-nav" aria-label="Main menu">
          {navLinks.map((link) => (
            <Link key={link.href} href={localize(link.href)}>{link.label}</Link>
          ))}
          <Suspense fallback={null}><LanguageSelector /></Suspense>
        </nav>
        <button
          type="button"
          className="nav-toggle"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="nav-toggle-bar" aria-hidden="true" />
          <span className="nav-toggle-bar" aria-hidden="true" />
          <span className="nav-toggle-bar" aria-hidden="true" />
        </button>
      </div>
      {open && (
        <nav className="site-nav-mobile" aria-label="Mobile menu">
          {navLinks.map((link) => (
            <Link key={link.href} href={localize(link.href)} onClick={close}>{link.label}</Link>
          ))}
          <div className="site-nav-mobile-lang"><Suspense fallback={null}><LanguageSelector /></Suspense></div>
        </nav>
      )}
    </header>
  );
}
