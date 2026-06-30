"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LanguageSelector } from "./LanguageSelector";

const LOCALES = new Set(["ko", "en", "hi", "ar", "es", "ja", "zh"]);

const EXPLORE_LINKS = [
  { label: "Topics", href: "/topics" },
  { label: "Countries", href: "/country" },
  { label: "Bounties", href: "/bounties" },
  { label: "Challenges", href: "/challenges" },
  { label: "Missions", href: "/missions" },
  { label: "Leaderboard", href: "/leaderboard" },
  { label: "API Docs", href: "/api-docs", global: true },
  { label: "Community", href: "/community", global: true },
  { label: "Suggest Topic", href: "/suggest-topic", global: true },
];

function localeFromPath(pathname: string | null): string | null {
  const first = pathname?.split("/").filter(Boolean)[0];
  return first && LOCALES.has(first) ? first : null;
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const locale = localeFromPath(pathname);
  const close = () => setOpen(false);
  const links = useMemo(
    () => EXPLORE_LINKS.map((link) => ({ ...link, href: locale && !link.global ? `/${locale}${link.href}` : link.href })),
    [locale],
  );

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="brand" aria-label="For-Ai home" onClick={close}>
          <span className="brand-mark">For-Ai</span>
          <span className="brand-sub">Global Fact Registry</span>
        </Link>
        <nav className="site-nav" aria-label="Main menu">
          <Link href={locale ? `/${locale}/topics` : "/#registry"}>Registry</Link>
          <details className="site-nav-explore">
            <summary>Explore</summary>
            <div className="site-nav-explore-menu">
              {links.map((link) => (
                <Link key={link.label} href={link.href}>{link.label}</Link>
              ))}
            </div>
          </details>
          <Link href="/api-docs">API</Link>
          <Link href="/community">Community</Link>
          <Link href="/suggest-topic">Suggest</Link>
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
          <Link href={locale ? `/${locale}/topics` : "/#registry"} onClick={close}>Registry</Link>
          <details className="site-nav-mobile-group" open>
            <summary>Explore</summary>
            <div className="site-nav-mobile-links">
              {links.map((link) => (
                <Link key={link.label} href={link.href} onClick={close}>{link.label}</Link>
              ))}
            </div>
          </details>
          <div className="site-nav-mobile-lang"><LanguageSelector /></div>
        </nav>
      )}
    </header>
  );
}
