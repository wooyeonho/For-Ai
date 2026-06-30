"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getLocaleFromPathname, getTranslations, withLocaleLink } from "../../lib/i18n/translations";
import { LanguageSelector } from "./LanguageSelector";
import { DEFAULT_LOCALE, isValidLocale } from "../../lib/i18n/locales";

interface ExploreLink {
  label: string;
  path: string;
  localized?: boolean;
}

const EXPLORE_LINKS: ExploreLink[] = [
  { label: "Registry", path: "/#registry" },
  { label: "Topics", path: "/topics/government", localized: true },
  { label: "Countries", path: "/country/kr", localized: true },
  { label: "Community", path: "/community" },
  { label: "Contribute", path: "/contribute" },
  { label: "Bounties", path: "/bounties", localized: true },
  { label: "Challenges", path: "/challenges", localized: true },
  { label: "Missions", path: "/missions", localized: true },
  { label: "Leaderboard", path: "/leaderboard", localized: true },
  { label: "API Docs", path: "/api-docs" },
  { label: "Suggest Topic", path: "/suggest-topic" },
];

function currentLocaleFromPath(pathname: string, localeParam?: string | null): SupportedLocale {
  const firstSegment = pathname.split("/").filter(Boolean)[0] ?? "";
  if (isValidLocale(firstSegment)) return firstSegment;
  return localeParam && isValidLocale(localeParam) ? localeParam : "en";
}

function hrefForLocale(link: ExploreLink, locale: SupportedLocale): string {
  if (link.localized) return `/${locale}${link.path}`;
  if (link.path.includes("?")) return `${link.path}&locale=${locale}`;
  const [path, hash] = link.path.split("#");
  return `${path}?locale=${locale}${hash ? `#${hash}` : ""}`;
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname);
  const t = getTranslations(locale);
  const close = () => setOpen(false);
  const localize = (href: string) => withLocaleLink(pathname, href);

  const navLinks = [
    { href: "/#registry", label: t.nav.registry },
    { href: "/api-docs", label: t.footer.apiDocs },
    { href: "/community", label: t.footer.community },
    { href: "/contribute", label: t.footer.contribute },
    { href: "/suggest-topic", label: t.nav.suggestTopic },
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
          <LanguageSelector />
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
          <div className="site-nav-mobile-lang"><LanguageSelector /></div>
        </nav>
      )}
    </header>
  );
}
