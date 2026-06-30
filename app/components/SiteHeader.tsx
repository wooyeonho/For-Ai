"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LanguageSelector } from "./LanguageSelector";
import { SUPPORTED_LOCALES, type SupportedLocale } from "../../lib/i18n/locales";

type ExploreLink = {
  label: string;
  href: string;
  localized?: boolean;
};

const EXPLORE_LINKS: ExploreLink[] = [
  { label: "Registry", href: "/#registry" },
  { label: "Topics", href: "/topics/government-fees", localized: true },
  { label: "Countries", href: "/country/kr", localized: true },
  { label: "Community", href: "/community" },
  { label: "Contribute", href: "/contribute" },
  { label: "Bounties", href: "/bounties", localized: true },
  { label: "Challenges", href: "/challenges", localized: true },
  { label: "Missions", href: "/missions", localized: true },
  { label: "Leaderboard", href: "/leaderboard", localized: true },
  { label: "API Docs", href: "/api-docs" },
  { label: "Suggest Topic", href: "/suggest-topic" },
];

function localeFromPath(pathname: string): SupportedLocale | null {
  const firstSegment = pathname.split("/").filter(Boolean)[0];
  return SUPPORTED_LOCALES.includes(firstSegment as SupportedLocale) ? (firstSegment as SupportedLocale) : null;
}

function hrefForLocale(link: ExploreLink, locale: SupportedLocale | null) {
  if (!locale) return link.href;
  if (link.localized) return `/${locale}${link.href}`;
  if (link.href.includes("?")) return `${link.href}&lang=${locale}`;
  if (link.href.includes("#")) {
    const [path, hash] = link.href.split("#");
    return `${path || "/"}?lang=${locale}#${hash}`;
  }
  return `${link.href}?lang=${locale}`;
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const locale = localeFromPath(pathname);
  const close = () => setOpen(false);
  const exploreLinks = EXPLORE_LINKS.map((link) => ({ ...link, href: hrefForLocale(link, locale) }));

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href={hrefForLocale({ label: "Home", href: "/" }, locale)} className="brand" aria-label="For-Ai home" onClick={close}>
          <span className="brand-mark">For-Ai</span>
          <span className="brand-sub">Global Fact Registry</span>
        </Link>
        <nav className="site-nav" aria-label="Main menu">
          <details className="explore-menu">
            <summary>Explore</summary>
            <div className="explore-dropdown" role="list">
              {exploreLinks.map((link) => (
                <Link key={link.label} href={link.href} role="listitem">
                  {link.label}
                </Link>
              ))}
            </div>
          </details>
          <Link href={hrefForLocale({ label: "Registry", href: "/#registry" }, locale)}>Registry</Link>
          <Link href={hrefForLocale({ label: "API Docs", href: "/api-docs" }, locale)}>API</Link>
          <Link href={hrefForLocale({ label: "Community", href: "/community" }, locale)}>Community</Link>
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
          <span className="site-nav-mobile-heading">Explore</span>
          {exploreLinks.map((link) => (
            <Link key={link.label} href={link.href} onClick={close}>
              {link.label}
            </Link>
          ))}
          <div className="site-nav-mobile-lang"><LanguageSelector /></div>
        </nav>
      )}
    </header>
  );
}
